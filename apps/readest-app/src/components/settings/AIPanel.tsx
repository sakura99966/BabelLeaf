import React, { useCallback, useState } from 'react';
import { PiCheckCircle, PiSpinner, PiWarningCircle } from 'react-icons/pi';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getAIProvider } from '@/services/ai/providers';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import {
  getTranslationApiKey,
  saveTranslationApiKey,
} from '@/services/ai/translationApiKey';
import type { AIProviderName, AISettings } from '@/services/ai/types';
import { useSettingsStore } from '@/store/settingsStore';
import { BoxedList, SettingLabel, SettingsRow } from './primitives';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

const AIPanel: React.FC = () => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings, setSettings, saveSettings } = useSettingsStore();
  const configured = { ...DEFAULT_AI_SETTINGS, ...settings.aiSettings };

  const [provider, setProvider] = useState<AIProviderName>(configured.provider);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(configured.ollamaBaseUrl);
  const [ollamaModel, setOllamaModel] = useState(configured.ollamaModel);
  const [apiKey, setApiKey] = useState(getTranslationApiKey());
  const [baseUrl, setBaseUrl] = useState(configured.openrouterBaseUrl ?? '');
  const [model, setModel] = useState(configured.openrouterModel ?? '');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const persist = useCallback(
    async (patch: Partial<AISettings>) => {
      const current = useSettingsStore.getState().settings;
      const nextAISettings = {
        ...DEFAULT_AI_SETTINGS,
        ...current.aiSettings,
        ...patch,
      };
      delete nextAISettings.openrouterApiKey;
      const next = {
        ...current,
        aiSettings: nextAISettings,
      };
      setSettings(next);
      await saveSettings(envConfig, next);
    },
    [envConfig, saveSettings, setSettings],
  );

  const selectProvider = (next: AIProviderName) => {
    setProvider(next);
    setConnectionStatus('idle');
    void persist({ provider: next });
  };

  const persistApiKey = async () => {
    try {
      await saveTranslationApiKey(apiKey);
      setConnectionStatus('idle');
      setErrorMessage('');
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : _('Secure credential storage is unavailable'),
      );
    }
  };

  const testConnection = async () => {
    setConnectionStatus('testing');
    setErrorMessage('');
    try {
      const testSettings: AISettings = {
        provider,
        ollamaBaseUrl: ollamaBaseUrl.trim(),
        ollamaModel: ollamaModel.trim(),
        openrouterApiKey: apiKey.trim(),
        openrouterBaseUrl: baseUrl.trim(),
        openrouterModel: model.trim(),
      };
      const connected = await getAIProvider(testSettings).healthCheck();
      setConnectionStatus(connected ? 'success' : 'error');
      if (!connected) setErrorMessage(_('Connection failed'));
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(error instanceof Error ? error.message : _('Connection failed'));
    }
  };

  return (
    <div className='my-4 w-full space-y-6'>
      <BoxedList
        title={_('AI Translation')}
        description={_(
          'Configure a local Ollama server or your own OpenAI-compatible API for translation.',
        )}
        data-setting-id='settings.ai.provider'
      >
        <SettingsRow label={_('Ollama (Local)')} asLabel>
          <input
            type='radio'
            name='translation-ai-provider'
            className='radio'
            checked={provider === 'ollama'}
            onChange={() => selectProvider('ollama')}
          />
        </SettingsRow>
        <SettingsRow label={_('OpenAI-compatible API')} asLabel>
          <input
            type='radio'
            name='translation-ai-provider'
            className='radio'
            checked={provider === 'openrouter'}
            onChange={() => selectProvider('openrouter')}
          />
        </SettingsRow>
      </BoxedList>

      {provider === 'ollama' ? (
        <BoxedList title={_('Ollama Configuration')}>
          <div className='flex flex-col gap-2 py-3 pe-4'>
            <SettingLabel>{_('Server URL')}</SettingLabel>
            <input
              type='text'
              className='input input-bordered input-sm w-full'
              value={ollamaBaseUrl}
              onChange={(event) => setOllamaBaseUrl(event.target.value)}
              onBlur={() => void persist({ ollamaBaseUrl: ollamaBaseUrl.trim() })}
              placeholder='http://127.0.0.1:11434'
              data-setting-id='settings.ai.ollamaUrl'
            />
          </div>
          <div className='flex flex-col gap-2 py-3 pe-4'>
            <SettingLabel>{_('Model')}</SettingLabel>
            <input
              type='text'
              className='input input-bordered input-sm w-full'
              value={ollamaModel}
              onChange={(event) => setOllamaModel(event.target.value)}
              onBlur={() => void persist({ ollamaModel: ollamaModel.trim() })}
              placeholder='qwen2.5'
              data-setting-id='settings.ai.ollamaModel'
            />
          </div>
        </BoxedList>
      ) : (
        <BoxedList
          title={_('OpenAI-compatible API')}
          description={_('No provider URL or model is preset; all connection values are user supplied.')}
        >
          <div className='flex flex-col gap-2 py-3 pe-4'>
            <SettingLabel>{_('API Key')}</SettingLabel>
            <input
              type='password'
              className='input input-bordered input-sm w-full'
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              onBlur={() => void persistApiKey()}
              autoComplete='off'
              data-setting-id='settings.ai.openrouterApiKey'
            />
          </div>
          <div className='flex flex-col gap-2 py-3 pe-4'>
            <SettingLabel>{_('Base URL')}</SettingLabel>
            <input
              type='text'
              className='input input-bordered input-sm w-full'
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              onBlur={() => void persist({ openrouterBaseUrl: baseUrl.trim() })}
              placeholder='https://example.com/v1'
              data-setting-id='settings.ai.openrouterBaseUrl'
            />
          </div>
          <div className='flex flex-col gap-2 py-3 pe-4'>
            <SettingLabel>{_('Model')}</SettingLabel>
            <input
              type='text'
              className='input input-bordered input-sm w-full'
              value={model}
              onChange={(event) => setModel(event.target.value)}
              onBlur={() => void persist({ openrouterModel: model.trim() })}
              placeholder='your-model-id'
              data-setting-id='settings.ai.openrouterModel'
            />
          </div>
        </BoxedList>
      )}

      <BoxedList title={_('Connection')}>
        <div className='flex min-h-14 items-center justify-between gap-3 pe-4'>
          <button
            className='btn btn-outline btn-sm'
            onClick={testConnection}
            disabled={connectionStatus === 'testing'}
          >
            {connectionStatus === 'testing' && <PiSpinner className='size-4 animate-spin' />}
            {_('Test Connection')}
          </button>
          {connectionStatus === 'success' && (
            <span className='text-success flex items-center gap-1 text-sm'>
              <PiCheckCircle className='size-4' />
              {_('Connected')}
            </span>
          )}
          {connectionStatus === 'error' && (
            <span className='text-error flex items-center gap-1 text-sm'>
              <PiWarningCircle className='size-4' />
              {errorMessage}
            </span>
          )}
        </div>
      </BoxedList>
    </div>
  );
};

export default AIPanel;
