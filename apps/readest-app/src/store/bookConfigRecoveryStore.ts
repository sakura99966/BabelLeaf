import { create } from 'zustand';

interface BookConfigRecoveryState {
  recovered: string[];
  markRecovered: (bookHash: string) => void;
  dismiss: (bookHash: string) => void;
}

// Session-only notices survive UI mounting but never enter book data/backups.
// Keep the registry bounded even during a large damaged-library investigation.
export const useBookConfigRecoveryStore = create<BookConfigRecoveryState>((set) => ({
  recovered: [],
  markRecovered: (bookHash) =>
    set((state) => ({
      recovered: [...state.recovered.filter((hash) => hash !== bookHash), bookHash].slice(-64),
    })),
  dismiss: (bookHash) =>
    set((state) => ({
      recovered: state.recovered.filter((hash) => hash !== bookHash),
    })),
}));
