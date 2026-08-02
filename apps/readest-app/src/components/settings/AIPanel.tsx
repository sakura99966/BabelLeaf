import React, { useCallback, useEffect, useState } from 'react';
import { PiCheckCircle, PiSpinner, PiWarningCircle } from 'react-icons/pi';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { getAIProvider } from '@/services/ai/providers';
import {
  getTranslationApiKey,
  saveTranslationApiKey,
  setTranslationApiKeyForSession,
} from '@/services/ai/translationApiKey';
import type { ActiveAIProviderName, AISettings } from '@/services/ai/types';
import { useSettingsStore } from '@/store/settingsStore';
import { BoxedList, SettingLabel, SettingsRow } from './primitives';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

const AIPanel: React.FC = () => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings, setSettings, saveSettings } = useSettingsStore();
  const configured = { ...DEFAULT_AI_SETTINGS, ...settings.aiSettings };
  const configuredProvider: ActiveAIProviderName = [
    'deepseek',
    'ollama',
    'openai',
    'anthropic',
  ].includes(configured.provider as ActiveAIProviderName)
    ? (configured.provider as ActiveAIProviderName)
    : 'deepseek';

  const [provider, setProvider] = useState<ActiveAIProviderName>(configuredProvider);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(configured.ollamaBaseUrl);
  const [ollamaModel, setOllamaModel] = useState(configured.ollamaModel);
  const [apiKey, setApiKey] = useState(() =>
    configuredProvider === 'deepseek' ||
    configuredProvider === 'openai' ||
    configuredProvider === 'anthropic'
      ? getTranslationApiKey(configuredProvider)
      : '',
  );
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setApiKey(
      provider === 'deepseek' || provider === 'openai' || provider === 'anthropic'
        ? getTranslationApiKey(provider)
        : '',
    );
    setConnectionStatus('idle');
    setErrorMessage('');
  }, [provider]);

  const persist = useCallback(
    async (patch: Partial<AISettings>) => {
      const current = useSettingsStore.getState().settings;
      const nextAISettings = {
        ...DEFAULT_AI_SETTINGS,
        ...current.aiSettings,
        ...patch,
      };
      // Credentials and retired custom-endpoint values are runtime-only and
      // must never be written to the regular settings file.
      delete nextAISettings.deepseekApiKey;
      delete nextAISettings.openaiApiKey;
      delete nextAISettings.anthropicApiKey;
      delete nextAISettings.openrouterApiKey;
      delete nextAISettings.openrouterBaseUrl;
      delete nextAISettings.openrouterModel;
      const next = {
        ...current,
        aiSettings: nextAISettings,
      };
      setSettings(next);
      await saveSettings(envConfig, next);
    },
    [envConfig, saveSettings, setSettings],
  );

  const selectProvider = (next: ActiveAIProviderName) => {
    setProvider(next);
    setConnectionStatus('idle');
    void persist({ provider: next });
  };

  const persistApiKey = async () => {
    if (provider === 'ollama') return;
    try {
      await saveTranslationApiKey(apiKey, provider);
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
        deepseekApiKey: provider === 'deepseek' ? apiKey.trim() : undefined,
        openaiApiKey: provider === 'openai' ? apiKey.trim() : undefined,
        anthropicApiKey: provider === 'anthropic' ? apiKey.trim() : undefined,
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
        description={_('Configure a named cloud translation provider or a local Ollama server.')}
        data-setting-id='settings.ai.provider'
      >
        <SettingsRow label={_('DeepSeek V4')} asLabel>
          <input
            type='radio'
            name='translation-ai-provider'
            className='radio'
            checked={provider === 'deepseek'}
            onChange={() => selectProvider('deepseek')}
          />
        </SettingsRow>
        <SettingsRow label={_('Ollama (Local)')} asLabel>
          <input
            type='radio'
            name='translation-ai-provider'
            className='radio'
            checked={provider === 'ollama'}
            onChange={() => selectProvider('ollama')}
          />
        </SettingsRow>
        <SettingsRow label={_('OpenAI')} asLabel>
          <input
            type='radio'
            name='translation-ai-provider'
            className='radio'
            checked={provider === 'openai'}
            onChange={() => selectProvider('openai')}
          />
        </SettingsRow>
        <SettingsRow label={_('Anthropic Claude')} asLabel>
          <input
            type='radio'
            name='translation-ai-provider'
            className='radio'
            checked={provider === 'anthropic'}
            onChange={() => selectProvider('anthropic')}
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
          title={
            provider === 'deepseek'
              ? _('DeepSeek V4')
              : provider === 'openai'
                ? _('OpenAI')
                : _('Anthropic Claude')
          }
          description={_(
            'BabelLeaf uses the official provider endpoint and built-in translation model. Enter only your API key.',
          )}
        >
          <div className='flex flex-col gap-2 py-3 pe-4'>
            <SettingLabel>{_('API Key')}</SettingLabel>
            <input
              type='password'
              className='input input-bordered input-sm w-full'
              value={apiKey}
              onChange={(event) => {
                const value = event.target.value;
                setApiKey(value);
                setTranslationApiKeyForSession(value, provider);
              }}
              onBlur={() => void persistApiKey()}
              autoComplete='off'
              data-setting-id={`settings.ai.${provider}ApiKey`}
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
