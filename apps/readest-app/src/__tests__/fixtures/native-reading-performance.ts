import { NativeAppService } from '@/services/nativeAppService';
import type { FoliateView } from '@/types/view';
import { TRANSLATION_PERFORMANCE_BUDGETS as budgets } from '@/services/translators/formatMatrix';
import { percentile95 } from './performanceFixtures';
import { useBookDataStore } from '@/store/bookDataStore';
import { releaseClosedBookContent } from '@/services/bookResourceLifecycle';

const frame = (): Promise<number> => new Promise((done) => requestAnimationFrame(done));
const report = (scenario: string) => {
  let status = document.getElementById('native-reading-status');
  if (!status) {
    status = document.createElement('output');
    status.id = 'native-reading-status';
    document.body.replaceChildren(status);
  }
  // Do not replace the live renderer when advancing the probe phase.
  status.textContent = JSON.stringify({ stage: 'reading-performance-running', scenario });
};

/** Real native managed import, Foliate rendering/search and immutable local samples. */
export async function runNativeReadingPerformance(root: string) {
  const service = new NativeAppService(root);
  await service.init();
  const measurements: Array<{
    name: keyof typeof budgets;
    value: number;
    budget: number;
    passed: boolean;
    details: unknown;
  }> = [];
  const record = (name: keyof typeof budgets, value: number, details: unknown) => {
    measurements.push({
      name,
      value,
      budget: budgets[name],
      passed: value <= budgets[name],
      details,
    });
  };
  try {
    for (const format of ['epub', 'pdf']) {
      report('managed-import-' + format);
      const path = root + '/sample-alice.' + format;
      const started = performance.now();
      const imported = await service.importBook(path, []);
      if (!imported) throw new Error('Managed local import returned no book');
      await service.saveLibraryBooks([...(await service.loadLibraryBooks()), imported]);
      const durableLibrary = await service.loadLibraryBooks();
      if (!durableLibrary.some((book) => book.hash === imported.hash))
        throw new Error('Imported library entry was not durable');
      const { file } = await service.loadBookContent(imported);
      const { DocumentLoader } = await import('@/libs/document');
      const nativeFilePath = await service.resolveNativeBookFilePath(imported);
      const { book } = await new DocumentLoader(file, {
        nativeFilePath: nativeFilePath ?? undefined,
      }).open();
      await import('foliate-js/view.js');
      const view = document.createElement('foliate-view') as FoliateView;
      view.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px;display:block';
      document.body.append(view);
      let resourcesReleased = false;
      try {
        await view.open(book);
        await view.init({ lastLocation: '' });
        const readable = () =>
          view.renderer
            .getContents()
            .some(
              ({ doc }) =>
                (doc.body?.textContent?.trim().length ?? 0) >= 10 &&
                (format !== 'pdf' ||
                  Array.from(doc.querySelectorAll('canvas')).some((canvas) => canvas.width > 0)),
            );
        for (let attempt = 0; !readable() && attempt < 4; attempt++) {
          await view.renderer.next();
          await frame();
        }
        await frame();
        if (!readable() || !view.lastLocation?.cfi)
          throw new Error('First readable page did not render');
        record('importMs', performance.now() - started, {
          format,
          bytes: file.size,
          managedCopy: true,
          durableLibraryEntry: true,
          nativeFilePath: !!nativeFilePath,
          viewport: { width: 800, height: 600 },
          readableTextAndCanvas: true,
        });

        // Warm a text-bearing section, not a cover whose CFI may legitimately
        // stay on the same image while its visual pagination advances.
        for (let index = 0; index < book.sections.length; index++) {
          const section = book.sections[index]!;
          if (section.linear === 'no') continue;
          const doc = await section.createDocument();
          if ((doc.body?.textContent?.length ?? 0) >= 1000) {
            await view.renderer.goTo({ index });
            await frame();
            await frame();
            break;
          }
        }

        report('page-turn-' + format);
        const turns: number[] = [];
        let direction: 'next' | 'prev' = 'next';
        let boundaryNoops = 0;
        let changedCfiCount = 0;
        const location = () =>
          JSON.stringify({
            cfi: view.lastLocation?.cfi,
            page: view.renderer.page,
            index: view.renderer.primaryIndex,
            start: view.renderer.start,
          });
        for (let index = 0; index < 50; index++) {
          const before = location();
          const beforeCfi: string | undefined = view.lastLocation?.cfi;
          const turnStarted = performance.now();
          await view.renderer[direction]();
          await frame();
          if (location() === before) {
            boundaryNoops++;
            direction = direction === 'next' ? 'prev' : 'next';
            await view.renderer[direction]();
            await frame();
          }
          if (location() === before || !view.renderer.getContents().length)
            throw new Error(
              'Page-turn benchmark did not navigate: ' +
                JSON.stringify({ format, index, direction, before, after: location() }),
            );
          if (beforeCfi !== view.lastLocation?.cfi) changedCfiCount++;
          turns.push(performance.now() - turnStarted);
        }
        record('pageTurnMs', percentile95(turns), {
          format,
          samplesMs: turns,
          turns: turns.length,
          changedCfiCount,
          boundaryNoops,
          scope: 'real renderer navigation plus next animation frame; boundary retry included',
        });

        report('full-book-search-' + format);
        const searches: number[] = [];
        const counts: number[] = [];
        for (let index = 0; index < 5; index++) {
          let matches = 0;
          let progress = 0;
          const searchStarted = performance.now();
          for await (const result of view.search({
            scope: 'book',
            mode: 'contains',
            matchCase: false,
            matchDiacritics: false,
            query: 'Alice',
          })) {
            if (typeof result !== 'string') {
              if (result.progress !== undefined) progress = result.progress;
              matches += result.subitems?.length ?? 0;
            }
          }
          searches.push(performance.now() - searchStarted);
          counts.push(matches);
          if (!matches || progress !== 1 || counts.some((count) => count !== matches))
            throw new Error(
              'Full-book search did not visit every section with stable nonempty results',
            );
          view.clearSearch();
        }
        record('searchMs', percentile95(searches), {
          format,
          query: 'Alice',
          samplesMs: searches,
          matchCounts: counts,
          sections: book.sections.length,
          allSectionsVisited: true,
          scope: 'full Foliate book search, including first uncached search and highlight creation',
        });
      } finally {
        view.clearSearch();
        view.close();
        view.remove();
        useBookDataStore.setState((state) => ({
          booksData: {
            ...state.booksData,
            [imported.hash]: {
              id: imported.hash,
              book: imported,
              file,
              config: null,
              bookDoc: book,
              isFixedLayout: format === 'pdf',
            },
          },
        }));
        const ownerReleased = await releaseClosedBookContent(imported.hash + '-performance');
        const released = useBookDataStore.getState().getBookData(imported.hash);
        resourcesReleased = ownerReleased && !released?.bookDoc && !released?.file;
      }
      if (!resourcesReleased)
        throw new Error('Closed native parser/file resources remain retained');
    }
    return {
      stage: 'reading-performance',
      passed: measurements.every((value) => value.passed),
      measurements,
      source: 'repository public-domain Alice EPUB/PDF copied into an owned native sandbox',
      scope:
        'native import/renderer/search evidence, not representative-corpus or minimum-host acceptance',
    };
  } catch (error) {
    return {
      stage: 'reading-performance',
      passed: false,
      error: String(error),
      measurements,
      scope: 'partial native reading evidence; failure retained',
    };
  }
}
