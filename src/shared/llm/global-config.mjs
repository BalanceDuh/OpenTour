const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
const DEFAULT_QWEN_MODEL = 'qwen3.5-flash';

const guessProvider = (modelName) => {
    const model = String(modelName || '').trim().toLowerCase();
    if (model.startsWith('qwen')) return 'qwen';
    return 'gemini';
};

export const resolveGlobalLlmConfig = (row, options = {}) => {
    const defaultGeminiModel = String(options.defaultGeminiModel || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
    const defaultQwenModel = String(options.defaultQwenModel || DEFAULT_QWEN_MODEL).trim() || DEFAULT_QWEN_MODEL;
    const selectedProvider = String(row?.selected_provider || (guessProvider(row?.llm_model_name) === 'qwen' ? 'qwen' : 'gemini')).trim() === 'qwen'
        ? 'qwen'
        : 'gemini';
    const legacyProvider = guessProvider(row?.llm_model_name);
    const geminiModelName = String(row?.gemini_model_name || (legacyProvider === 'gemini' ? row?.llm_model_name : defaultGeminiModel) || defaultGeminiModel).trim() || defaultGeminiModel;
    const qwenModelName = String(row?.qwen_model_name || (legacyProvider === 'qwen' ? row?.llm_model_name : defaultQwenModel) || defaultQwenModel).trim() || defaultQwenModel;
    const geminiApiKey = String(row?.gemini_api_key || (selectedProvider === 'gemini' ? row?.llm_api_key : '') || '').trim();
    const qwenApiKey = String(row?.qwen_api_key || (selectedProvider === 'qwen' ? row?.llm_api_key : '') || '').trim();
    return {
        selectedProvider,
        gemini: {
            modelName: geminiModelName,
            apiKey: geminiApiKey
        },
        qwen: {
            modelName: qwenModelName,
            apiKey: qwenApiKey
        },
        activeModel: selectedProvider === 'qwen' ? qwenModelName : geminiModelName,
        activeApiKey: selectedProvider === 'qwen' ? qwenApiKey : geminiApiKey,
        updatedAt: row?.updated_at ? String(row.updated_at) : null
    };
};
