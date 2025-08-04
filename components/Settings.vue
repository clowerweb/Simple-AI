<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import CloseIcon from './icons/CloseIcon.vue';

const props = defineProps({
  modelOpen: Boolean,
});

const emit = defineEmits(['close', 'settingsChanged']);

const PROVIDER_TYPES = {
  LOCAL: 'local',
  CUSTOM: 'custom'
};

const TABS = {
  PROVIDERS: 'providers',
  MODELS: 'models',
  PROMPTS: 'prompts'
};

const LOCAL_MODELS = [{ id: 'onnx-community/Qwen3-4B-ONNX', name: 'Qwen3 4B (Default)', size: '~2.5GB' }];

const settings = ref({
  provider: PROVIDER_TYPES.LOCAL,
  localModel: 'onnx-community/Qwen3-4B-ONNX',
  providers: [],
  customApis: [],
  selectedCustomApi: null,
  systemPrompts: [],
  defaultSystemPrompt: null,
  defaultProviderId: null,
  defaultCustomApi: null,
  newProvider: {
    name: '',
    apiUrl: '',
    apiKeys: [{ name: 'Default', key: '', isDefault: true }]
  },
  newCustomApi: {
    name: '',
    providerId: '',
    keyId: '',
    modelName: '',
    maxTokens: 2048,
    temperature: 0.7,
    topP: 0.9,
    minP: 0.0,
    topK: 50,
    repetitionPenalty: 1.1,
    presencePenalty: 0.0,
    frequencyPenalty: 0.0
  },
  newSystemPrompt: {
    name: '',
    content: '',
    description: ''
  }
});

const activeTab = ref(TABS.PROVIDERS);
const isEditingCustomApi = ref(false);
const editingApiIndex = ref(-1);
const showForm = ref(false);
const isEditingProvider = ref(false);
const editingProviderIndex = ref(-1);
const showProviderForm = ref(false);
const isEditingSystemPrompt = ref(false);
const editingSystemPromptIndex = ref(-1);
const showSystemPromptForm = ref(false);

// Load settings from localStorage
const loadSettings = () => {
  const stored = localStorage.getItem('ai-chat-settings');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      settings.value = { ...settings.value, ...parsed };
      // Ensure arrays exist
      if (!Array.isArray(settings.value.customApis)) {
        settings.value.customApis = [];
      }
      if (!Array.isArray(settings.value.providers)) {
        settings.value.providers = [];
      }
      if (!Array.isArray(settings.value.systemPrompts)) {
        settings.value.systemPrompts = [];
      }
      // Set default system prompt if none is set
      if (!settings.value.defaultSystemPrompt) {
        settings.value.defaultSystemPrompt = '';
      }
      // Initialize default provider and custom API if not set
      if (settings.value.defaultProviderId === undefined) {
        settings.value.defaultProviderId = null;
      }
      if (settings.value.defaultCustomApi === undefined) {
        settings.value.defaultCustomApi = null;
      }
    } catch (e) {
      console.warn('Failed to parse stored settings:', e);
    }
  }
};

// Save settings to localStorage
const saveSettings = () => {
  localStorage.setItem('ai-chat-settings', JSON.stringify(settings.value));
  emit('settingsChanged', settings.value);
};

// Save settings to localStorage without emitting (for internal use)
const saveSettingsToStorage = () => {
  localStorage.setItem('ai-chat-settings', JSON.stringify(settings.value));
};

// Load settings on mount first
loadSettings();

// Watch for changes and auto-save
watch(settings, () => {
  saveSettingsToStorage();
}, { deep: true, flush: 'post' });

// Watch for specific critical changes that require worker reinitialization
watch([
  () => settings.value.provider,
  () => settings.value.localModel,
  () => settings.value.selectedCustomApi
], () => {
  emit('settingsChanged', settings.value);
}, { flush: 'post' });

// Custom API management functions
const resetNewCustomApi = () => {
  settings.value.newCustomApi = {
    name: '',
    providerId: '',
    keyId: '',
    modelName: '',
    maxTokens: 2048,
    temperature: 0.7,
    topP: 0.9,
    minP: 0.0,
    topK: 50,
    repetitionPenalty: 1.1,
    presencePenalty: 0.0,
    frequencyPenalty: 0.0
  };
};

const addCustomApi = () => {
  if (!settings.value.newCustomApi.name.trim() || !settings.value.newCustomApi.providerId) {
    return;
  }
  
  // Set default keyId if not set
  if (!settings.value.newCustomApi.keyId) {
    const defaultKey = getDefaultKeyForProvider(settings.value.newCustomApi.providerId);
    settings.value.newCustomApi.keyId = defaultKey;
  }
  
  if (isEditingCustomApi.value) {
    // Update existing API
    settings.value.customApis[editingApiIndex.value] = { ...settings.value.newCustomApi };
    isEditingCustomApi.value = false;
    editingApiIndex.value = -1;
  } else {
    // Add new API
    settings.value.customApis.push({ ...settings.value.newCustomApi });
  }
  
  resetNewCustomApi();
  showForm.value = false;
};

const editCustomApi = (index) => {
  settings.value.newCustomApi = { ...settings.value.customApis[index] };
  isEditingCustomApi.value = true;
  editingApiIndex.value = index;
  showForm.value = true;
};

const deleteCustomApi = (index) => {
  settings.value.customApis.splice(index, 1);
  if (settings.value.selectedCustomApi === index) {
    settings.value.selectedCustomApi = null;
  } else if (settings.value.selectedCustomApi > index) {
    settings.value.selectedCustomApi--;
  }
  
  // Reset default if this was the default API
  if (settings.value.defaultCustomApi === index) {
    settings.value.defaultCustomApi = null;
  } else if (settings.value.defaultCustomApi > index) {
    settings.value.defaultCustomApi--;
  }
};

const cancelEdit = () => {
  isEditingCustomApi.value = false;
  editingApiIndex.value = -1;
  resetNewCustomApi();
  showForm.value = false;
};

const cloneCustomApi = (index) => {
  const apiToClone = settings.value.customApis[index];
  settings.value.newCustomApi = { 
    ...apiToClone, 
    name: `${apiToClone.name} (Copy)` 
  };
  isEditingCustomApi.value = false;
  editingApiIndex.value = -1;
  showForm.value = true;
  // Scroll to the form
  document.querySelector('[data-add-api-form]')?.scrollIntoView({ behavior: 'smooth' });
};

const selectCustomApi = (index) => {
  settings.value.selectedCustomApi = index;
};

const startNewApi = () => {
  resetNewCustomApi();
  // Set default provider if available
  if (settings.value.defaultProviderId) {
    settings.value.newCustomApi.providerId = settings.value.defaultProviderId;
    settings.value.newCustomApi.keyId = getDefaultKeyForProvider(settings.value.defaultProviderId);
  }
  isEditingCustomApi.value = false;
  editingApiIndex.value = -1;
  showForm.value = true;
  // Scroll to the form after it's rendered
  nextTick(() => {
    document.querySelector('[data-add-api-form]')?.scrollIntoView({ behavior: 'smooth' });
  });
};

// Provider management functions
const resetNewProvider = () => {
  settings.value.newProvider = {
    name: '',
    apiUrl: '',
    apiKeys: [{ name: 'Default', key: '', isDefault: true }]
  };
};

const addApiKeyToProvider = () => {
  settings.value.newProvider.apiKeys.push({ 
    name: `Key ${settings.value.newProvider.apiKeys.length + 1}`, 
    key: '', 
    isDefault: false 
  });
};

const removeApiKeyFromProvider = (index) => {
  if (settings.value.newProvider.apiKeys.length > 1) {
    const removedKey = settings.value.newProvider.apiKeys[index];
    settings.value.newProvider.apiKeys.splice(index, 1);
    // If we removed the default key, make the first key default
    if (removedKey.isDefault && settings.value.newProvider.apiKeys.length > 0) {
      settings.value.newProvider.apiKeys[0].isDefault = true;
    }
  }
};

const setDefaultApiKey = (index) => {
  settings.value.newProvider.apiKeys.forEach((key, i) => {
    key.isDefault = i === index;
  });
};

const addProvider = () => {
  if (!settings.value.newProvider.name.trim() || !settings.value.newProvider.apiUrl.trim()) {
    return;
  }
  
  if (isEditingProvider.value) {
    // Update existing provider  
    settings.value.providers[editingProviderIndex.value] = { 
      ...settings.value.newProvider,
      id: settings.value.providers[editingProviderIndex.value].id
    };
    isEditingProvider.value = false;
    editingProviderIndex.value = -1;
  } else {
    // Add new provider
    const newProvider = { 
      ...settings.value.newProvider,
      id: Date.now().toString()
    };
    settings.value.providers.push(newProvider);
  }
  
  resetNewProvider();
  showProviderForm.value = false;
};

const editProvider = (index) => {
  settings.value.newProvider = { ...settings.value.providers[index] };
  isEditingProvider.value = true;
  editingProviderIndex.value = index;
  showProviderForm.value = true;
};

const deleteProvider = (index) => {
  const providerId = settings.value.providers[index].id;
  settings.value.providers.splice(index, 1);
  
  // Reset default provider if this was the default
  if (settings.value.defaultProviderId === providerId) {
    settings.value.defaultProviderId = null;
  }
  
  // Remove any custom APIs that use this provider
  const removedApis = [];
  settings.value.customApis = settings.value.customApis.filter((api, apiIndex) => {
    if (api.providerId === providerId) {
      removedApis.push(apiIndex);
      return false;
    }
    return true;
  });
  
  // Reset selected API if it was using this provider
  if (settings.value.selectedCustomApi !== null && 
      removedApis.includes(settings.value.selectedCustomApi)) {
    settings.value.selectedCustomApi = null;
  }
  
  // Reset default API if it was using this provider
  if (settings.value.defaultCustomApi !== null && 
      removedApis.includes(settings.value.defaultCustomApi)) {
    settings.value.defaultCustomApi = null;
  }
};

const cancelProviderEdit = () => {
  isEditingProvider.value = false;
  editingProviderIndex.value = -1;
  resetNewProvider();
  showProviderForm.value = false;
};

const startNewProvider = () => {
  resetNewProvider();
  isEditingProvider.value = false;
  editingProviderIndex.value = -1;
  showProviderForm.value = true;
  // Scroll to the form after it's rendered
  nextTick(() => {
    document.querySelector('[data-add-provider-form]')?.scrollIntoView({ behavior: 'smooth' });
  });
};

const getProviderById = (id) => {
  return settings.value.providers.find(p => p.id === id);
};

const getApiKeysForProvider = (providerId) => {
  const provider = getProviderById(providerId);
  return provider ? provider.apiKeys : [];
};

const getDefaultKeyForProvider = (providerId) => {
  const provider = getProviderById(providerId);
  if (provider) {
    const defaultKey = provider.apiKeys.find(key => key.isDefault);
    return defaultKey ? defaultKey.name : '';
  }
  return '';
};

// System Prompt management functions
const resetNewSystemPrompt = () => {
  settings.value.newSystemPrompt = {
    name: '',
    content: '',
    description: ''
  };
};

const addSystemPrompt = () => {
  if (!settings.value.newSystemPrompt.name.trim() || !settings.value.newSystemPrompt.content.trim()) {
    return;
  }
  
  if (isEditingSystemPrompt.value) {
    // Update existing system prompt
    settings.value.systemPrompts[editingSystemPromptIndex.value] = { 
      ...settings.value.newSystemPrompt,
      id: settings.value.systemPrompts[editingSystemPromptIndex.value].id
    };
    isEditingSystemPrompt.value = false;
    editingSystemPromptIndex.value = -1;
  } else {
    // Add new system prompt
    const newPrompt = { 
      ...settings.value.newSystemPrompt,
      id: Date.now().toString(),
      isBuiltIn: false
    };
    settings.value.systemPrompts.push(newPrompt);
  }
  
  resetNewSystemPrompt();
  showSystemPromptForm.value = false;
};

const editSystemPrompt = (index) => {
  settings.value.newSystemPrompt = { ...settings.value.systemPrompts[index] };
  isEditingSystemPrompt.value = true;
  editingSystemPromptIndex.value = index;
  showSystemPromptForm.value = true;
};

const deleteSystemPrompt = (index) => {
  const promptId = settings.value.systemPrompts[index].id;
  settings.value.systemPrompts.splice(index, 1);
  
  // If this was the default prompt, reset to built-in default
  if (settings.value.defaultSystemPrompt === promptId) {
    settings.value.defaultSystemPrompt = '';
  }
};

const cancelSystemPromptEdit = () => {
  isEditingSystemPrompt.value = false;
  editingSystemPromptIndex.value = -1;
  resetNewSystemPrompt();
  showSystemPromptForm.value = false;
};

const startNewSystemPrompt = () => {
  resetNewSystemPrompt();
  isEditingSystemPrompt.value = false;
  editingSystemPromptIndex.value = -1;
  showSystemPromptForm.value = true;
  // Scroll to the form after it's rendered
  nextTick(() => {
    document.querySelector('[data-add-prompt-form]')?.scrollIntoView({ behavior: 'smooth' });
  });
};

const useBuiltInTemplate = (template) => {
  settings.value.newSystemPrompt = {
    name: template.name.replace(' (Default)', ''),
    content: template.content,
    description: template.description
  };
  showSystemPromptForm.value = true;
  nextTick(() => {
    document.querySelector('[data-add-prompt-form]')?.scrollIntoView({ behavior: 'smooth' });
  });
};

// Built-in system prompt
const DEFAULT_SYSTEM_PROMPT = {
  id: '',
  name: 'Helpful Assistant',
  content: 'Be a helpful assistant',
  description: 'Generic helpful assistant',
  isBuiltIn: true
};

const getAllSystemPrompts = computed(() => {
  return [DEFAULT_SYSTEM_PROMPT, ...settings.value.systemPrompts];
});

const getSystemPromptById = (id) => {
  return getAllSystemPrompts.value.find(p => p.id === id);
};

// Default setting functions
const setDefaultProvider = (providerId) => {
  settings.value.defaultProviderId = providerId;
};

const setDefaultCustomApi = (apiIndex) => {
  settings.value.defaultCustomApi = apiIndex;
};

const setDefaultSystemPrompt = (promptId) => {
  settings.value.defaultSystemPrompt = promptId;
};

const canSave = computed(() => {
  if (settings.value.provider === PROVIDER_TYPES.CUSTOM) {
    return settings.value.customApis.length > 0 && settings.value.selectedCustomApi !== null;
  }
  return true;
});

const canAddCustomApi = computed(() => {
  return settings.value.newCustomApi.name.trim() && settings.value.newCustomApi.providerId;
});

const canAddProvider = computed(() => {
  return settings.value.newProvider.name.trim() && 
         settings.value.newProvider.apiUrl.trim() &&
         settings.value.newProvider.apiKeys.some(key => key.key.trim());
});

const canAddSystemPrompt = computed(() => {
  return settings.value.newSystemPrompt.name.trim() && settings.value.newSystemPrompt.content.trim();
});

const handleClose = () => {
  if (canSave.value) {
    saveSettings();
  }
  emit('close');
};
</script>

<template>
  <div v-if="modelOpen" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-gray-800 rounded-2xl border border-white/20 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-white/10">
        <h2 class="text-xl font-semibold text-white">Settings</h2>
        <button
          @click="handleClose"
          class="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <CloseIcon class="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-white/10">
        <button
            @click="activeTab = TABS.PROVIDERS"
            :class="[
            'px-6 py-3 text-sm font-medium transition-colors border-b-2',
            activeTab === TABS.PROVIDERS
              ? 'text-blue-400 border-blue-400'
              : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
          ]"
        >
          Providers
        </button>
        <button
          @click="activeTab = TABS.MODELS"
          :class="[
            'px-6 py-3 text-sm font-medium transition-colors border-b-2',
            activeTab === TABS.MODELS
              ? 'text-blue-400 border-blue-400'
              : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
          ]"
        >
          Models
        </button>
        <button
          @click="activeTab = TABS.PROMPTS"
          :class="[
            'px-6 py-3 text-sm font-medium transition-colors border-b-2',
            activeTab === TABS.PROMPTS
              ? 'text-blue-400 border-blue-400'
              : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
          ]"
        >
          System Prompts
        </button>
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-y-auto">
        <!-- Models Tab -->
        <div v-if="activeTab === TABS.MODELS" class="p-6 space-y-6">
          <!-- Provider Selection -->
          <div>
            <label class="block text-sm font-medium text-gray-200 mb-3">Provider Type</label>
            <div class="space-y-2">
              <label class="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  v-model="settings.provider"
                  :value="PROVIDER_TYPES.LOCAL"
                  class="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600"
                />
                <div>
                  <div class="text-white">Transformers.js</div>
                  <div class="text-sm text-gray-400">Runs in browser using WebGPU</div>
                </div>
              </label>
              
              <label class="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  v-model="settings.provider"
                  :value="PROVIDER_TYPES.CUSTOM"
                  class="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600"
                />
                <div>
                  <div class="text-white">Custom API</div>
                  <div class="text-sm text-gray-400">OpenAI-compatible APIs with advanced settings</div>
                </div>
              </label>
            </div>
          </div>

          <!-- Local Model Settings -->
          <div v-if="settings.provider === PROVIDER_TYPES.LOCAL" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-200 mb-2">Local Model</label>
              <select
                v-model="settings.localModel"
                class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option v-for="model in LOCAL_MODELS" :key="model.id" :value="model.id">
                  {{ model.name }} ({{ model.size }})
                </option>
              </select>
              <p class="text-xs text-gray-400 mt-2">Model will be downloaded and cached on first use</p>
            </div>
          </div>

          <!-- Custom API Settings -->
          <div v-if="settings.provider === PROVIDER_TYPES.CUSTOM" class="space-y-6">
            <!-- API List with Selection -->
            <div>
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-medium text-white">Custom APIs</h3>
                <button
                  @click="startNewApi"
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                  </svg>
                  New
                </button>
              </div>

              <!-- APIs Grid -->
              <div v-if="settings.customApis.length > 0" class="space-y-2">
                <div 
                  v-for="(api, index) in settings.customApis" 
                  :key="index" 
                  @click="selectCustomApi(index)"
                  class="p-4 rounded-lg border cursor-pointer transition-all"
                  :class="settings.selectedCustomApi === index 
                    ? 'bg-blue-600/20 border-blue-500 ring-2 ring-blue-500/50' 
                    : 'bg-gray-800 border-gray-600 hover:border-gray-500'"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-3">
                        <div class="text-white font-medium">{{ api.name }}</div>
                        <div v-if="settings.selectedCustomApi === index" class="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                          Active
                        </div>
                        <div v-if="settings.defaultCustomApi === index" class="px-2 py-1 bg-green-600 text-white text-xs rounded-full">
                          Default
                        </div>
                      </div>
                      <div class="text-sm text-gray-400 mt-1">
                        Provider: {{ getProviderById(api.providerId)?.name || 'Unknown' }}
                      </div>
                      <div class="text-xs text-gray-500 mt-1">
                        Model: {{ api.modelName || 'Default' }} • Temp: {{ api.temperature }} • Max: {{ api.maxTokens }}
                      </div>
                    </div>
                    <div class="flex gap-2 ml-4" @click.stop>
                      <button
                        v-if="settings.defaultCustomApi !== index"
                        @click="setDefaultCustomApi(index)"
                        class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                        title="Set as default"
                      >
                        Set as default
                      </button>
                      <button
                        @click="editCustomApi(index)"
                        class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                        title="Edit"
                      >
                        Edit
                      </button>
                      <button
                        @click="cloneCustomApi(index)"
                        class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                        title="Clone"
                      >
                        Clone
                      </button>
                      <button
                        @click="deleteCustomApi(index)"
                        class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Empty State -->
              <div v-else class="text-center py-8">
                <div class="text-gray-400 mb-4">No custom APIs configured</div>
                <button
                  @click="startNewApi"
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Add Your First API
                </button>
              </div>
            </div>

            <!-- API Form (conditionally shown) -->
            <div v-if="showForm" class="bg-gray-800 rounded-lg p-4 border border-gray-600" data-add-api-form>
              <h3 class="text-lg font-medium text-white mb-4">
                {{ isEditingCustomApi ? 'Edit API' : 'Add New API' }}
              </h3>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Basic Settings -->
                <div>
                  <label class="block text-sm font-medium text-gray-200 mb-2">Name *</label>
                  <input
                    type="text"
                    v-model="settings.newCustomApi.name"
                    placeholder="My Custom API"
                    class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label class="block text-sm font-medium text-gray-200 mb-2">Provider *</label>
                  <select
                    v-model="settings.newCustomApi.providerId"
                    @change="settings.newCustomApi.keyId = getDefaultKeyForProvider(settings.newCustomApi.providerId)"
                    class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select a provider</option>
                    <option v-for="provider in settings.providers" :key="provider.id" :value="provider.id">
                      {{ provider.name }}
                    </option>
                  </select>
                </div>
                
                <div v-if="settings.newCustomApi.providerId">
                  <label class="block text-sm font-medium text-gray-200 mb-2">API Key</label>
                  <select
                    v-model="settings.newCustomApi.keyId"
                    class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option v-for="key in getApiKeysForProvider(settings.newCustomApi.providerId)" :key="key.name" :value="key.name">
                      {{ key.name }} {{ key.isDefault ? '(Default)' : '' }}
                    </option>
                  </select>
                </div>
                
                <div class="md:col-span-2">
                  <label class="block text-sm font-medium text-gray-200 mb-2">Model Name (Optional)</label>
                  <input
                    type="text"
                    v-model="settings.newCustomApi.modelName"
                    placeholder="gpt-3.5-turbo"
                    class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <!-- Advanced Parameters -->
              <div class="mt-6">
                <h4 class="text-md font-medium text-white mb-4">Advanced Parameters</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <!-- Max Tokens -->
                  <div>
                    <label class="block text-sm font-medium text-gray-200 mb-2">Max Tokens</label>
                    <input
                      type="number"
                      v-model.number="settings.newCustomApi.maxTokens"
                      min="1"
                      max="32768"
                      placeholder="2048"
                      class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <!-- Temperature -->
                  <div>
                    <label class="block text-sm font-medium text-gray-200 mb-2">
                      Temperature: {{ settings.newCustomApi.temperature }}
                    </label>
                    <input
                      type="range"
                      v-model.number="settings.newCustomApi.temperature"
                      min="0"
                      max="2"
                      step="0.1"
                      class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div class="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0.0</span>
                      <span>2.0</span>
                    </div>
                  </div>

                  <!-- Top P -->
                  <div>
                    <label class="block text-sm font-medium text-gray-200 mb-2">
                      Top P: {{ settings.newCustomApi.topP }}
                    </label>
                    <input
                      type="range"
                      v-model.number="settings.newCustomApi.topP"
                      min="0"
                      max="1"
                      step="0.01"
                      class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div class="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0.0</span>
                      <span>1.0</span>
                    </div>
                  </div>

                  <!-- Min P -->
                  <div>
                    <label class="block text-sm font-medium text-gray-200 mb-2">
                      Min P: {{ settings.newCustomApi.minP }}
                    </label>
                    <input
                      type="range"
                      v-model.number="settings.newCustomApi.minP"
                      min="0"
                      max="1"
                      step="0.01"
                      class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div class="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0.0</span>
                      <span>1.0</span>
                    </div>
                  </div>

                  <!-- Top K -->
                  <div>
                    <label class="block text-sm font-medium text-gray-200 mb-2">Top K</label>
                    <input
                      type="number"
                      v-model.number="settings.newCustomApi.topK"
                      min="0"
                      max="999"
                      class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <!-- Repetition Penalty -->
                  <div>
                    <label class="block text-sm font-medium text-gray-200 mb-2">
                      Repetition Penalty: {{ settings.newCustomApi.repetitionPenalty }}
                    </label>
                    <input
                      type="range"
                      v-model.number="settings.newCustomApi.repetitionPenalty"
                      min="0.01"
                      max="5"
                      step="0.01"
                      class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div class="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0.01</span>
                      <span>5.0</span>
                    </div>
                  </div>

                  <!-- Presence Penalty -->
                  <div>
                    <label class="block text-sm font-medium text-gray-200 mb-2">
                      Presence Penalty: {{ settings.newCustomApi.presencePenalty }}
                    </label>
                    <input
                      type="range"
                      v-model.number="settings.newCustomApi.presencePenalty"
                      min="-2"
                      max="2"
                      step="0.1"
                      class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div class="flex justify-between text-xs text-gray-400 mt-1">
                      <span>-2.0</span>
                      <span>+2.0</span>
                    </div>
                  </div>

                  <!-- Frequency Penalty -->
                  <div>
                    <label class="block text-sm font-medium text-gray-200 mb-2">
                      Frequency Penalty: {{ settings.newCustomApi.frequencyPenalty }}
                    </label>
                    <input
                      type="range"
                      v-model.number="settings.newCustomApi.frequencyPenalty"
                      min="-2"
                      max="2"
                      step="0.1"
                      class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div class="flex justify-between text-xs text-gray-400 mt-1">
                      <span>-2.0</span>
                      <span>+2.0</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="flex gap-2 mt-6">
                <button
                  @click="addCustomApi"
                  :disabled="!canAddCustomApi"
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {{ isEditingCustomApi ? 'Update API' : 'Add API' }}
                </button>
                
                <button
                  @click="cancelEdit"
                  class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Providers Tab -->
        <div v-if="activeTab === TABS.PROVIDERS" class="p-6 space-y-6">
          <div>
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-medium text-white">API Providers</h3>
              <button
                @click="startNewProvider"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                </svg>
                New Provider
              </button>
            </div>

            <!-- Providers Grid -->
            <div v-if="settings.providers.length > 0" class="space-y-2">
              <div 
                v-for="(provider, index) in settings.providers" 
                :key="provider.id" 
                class="p-4 rounded-lg border bg-gray-800 border-gray-600 hover:border-gray-500 transition-all"
              >
                <div class="flex items-center justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-3">
                      <div class="text-white font-medium">{{ provider.name }}</div>
                      <div v-if="settings.defaultProviderId === provider.id" class="px-2 py-1 bg-green-600 text-white text-xs rounded-full">
                        Default
                      </div>
                    </div>
                    <div class="text-sm text-gray-400 mt-1">{{ provider.apiUrl }}</div>
                    <div class="text-xs text-gray-500 mt-1">
                      {{ provider.apiKeys.length }} API key{{ provider.apiKeys.length !== 1 ? 's' : '' }} configured
                    </div>
                  </div>
                  <div class="flex gap-2 ml-4">
                    <button
                      v-if="settings.defaultProviderId !== provider.id"
                      @click="setDefaultProvider(provider.id)"
                      class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                      title="Set as default"
                    >
                      Set as default
                    </button>
                    <button
                      @click="editProvider(index)"
                      class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                      title="Edit"
                    >
                      Edit
                    </button>
                    <button
                      @click="deleteProvider(index)"
                      class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                      title="Delete"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Empty State -->
            <div v-else class="text-center py-8">
              <div class="text-gray-400 mb-4">No API providers configured</div>
              <button
                @click="startNewProvider"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Add Your First Provider
              </button>
            </div>

            <!-- Provider Form (conditionally shown) -->
            <div v-if="showProviderForm" class="bg-gray-800 rounded-lg p-4 border border-gray-600 mt-6" data-add-provider-form>
              <h3 class="text-lg font-medium text-white mb-4">
                {{ isEditingProvider ? 'Edit Provider' : 'Add New Provider' }}
              </h3>
              
              <div class="space-y-4">
                <!-- Basic Settings -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-200 mb-2">Provider Name *</label>
                    <input
                      type="text"
                      v-model="settings.newProvider.name"
                      placeholder="OpenAI, Local LLM, etc."
                      class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium text-gray-200 mb-2">API URL *</label>
                    <input
                      type="url"
                      v-model="settings.newProvider.apiUrl"
                      placeholder="https://api.openai.com/v1/chat/completions"
                      class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <!-- API Keys Section -->
                <div>
                  <div class="flex items-center justify-between mb-3">
                    <label class="block text-sm font-medium text-gray-200">API Keys</label>
                    <button
                      @click="addApiKeyToProvider"
                      class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                    >
                      Add Key
                    </button>
                  </div>
                  
                  <div class="space-y-3">
                    <div 
                      v-for="(apiKey, index) in settings.newProvider.apiKeys" 
                      :key="index"
                      class="p-3 bg-gray-900 rounded-lg border border-gray-700"
                    >
                      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                        <div>
                          <label class="block text-xs font-medium text-gray-300 mb-1">Key Name</label>
                          <input
                            type="text"
                            v-model="apiKey.name"
                            placeholder="Key name"
                            class="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div>
                          <label class="block text-xs font-medium text-gray-300 mb-1">API Key</label>
                          <input
                            type="password"
                            v-model="apiKey.key"
                            placeholder="sk-..."
                            class="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div class="flex items-center gap-2">
                          <label class="flex items-center cursor-pointer">
                            <input
                              type="radio"
                              :name="`default-key-${Date.now()}`"
                              :checked="apiKey.isDefault"
                              @change="setDefaultApiKey(index)"
                              class="w-3 h-3 text-blue-600 bg-gray-700 border-gray-600"
                            />
                            <span class="ml-1 text-xs text-gray-300">Default</span>
                          </label>
                          
                          <button
                            v-if="settings.newProvider.apiKeys.length > 1"
                            @click="removeApiKeyFromProvider(index)"
                            class="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex gap-2 pt-4">
                  <button
                    @click="addProvider"
                    :disabled="!canAddProvider"
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {{ isEditingProvider ? 'Update Provider' : 'Add Provider' }}
                  </button>
                  
                  <button
                    @click="cancelProviderEdit"
                    class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- System Prompts Tab -->
        <div v-if="activeTab === TABS.PROMPTS" class="p-6 space-y-6">

          <!-- Built-in System Prompt -->
          <div>
            <h3 class="text-lg font-medium text-white mb-4">Built-in System Prompt</h3>
            <div class="p-4 rounded-lg border bg-gray-800 border-gray-600">
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-3">
                    <div class="text-white font-medium">{{ DEFAULT_SYSTEM_PROMPT.name }}</div>
                    <div v-if="settings.defaultSystemPrompt === DEFAULT_SYSTEM_PROMPT.id" class="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                      Default
                    </div>
                  </div>
                  <div class="text-sm text-gray-400 mt-1">{{ DEFAULT_SYSTEM_PROMPT.description }}</div>
                  <div class="text-xs text-gray-500 mt-1">
                    {{ DEFAULT_SYSTEM_PROMPT.content.length }} characters
                  </div>
                </div>
                <div class="flex gap-2 ml-4">
                  <button
                    v-if="settings.defaultSystemPrompt !== DEFAULT_SYSTEM_PROMPT.id"
                    @click="setDefaultSystemPrompt(DEFAULT_SYSTEM_PROMPT.id)"
                    class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                    title="Set as default"
                  >
                    Set as default
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Custom System Prompts -->
          <div>
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-medium text-white">Custom System Prompts</h3>
              <button
                @click="startNewSystemPrompt"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                </svg>
                New Prompt
              </button>
            </div>

            <!-- Custom Prompts Grid -->
            <div v-if="settings.systemPrompts.length > 0" class="space-y-2">
              <div 
                v-for="(prompt, index) in settings.systemPrompts" 
                :key="prompt.id" 
                class="p-4 rounded-lg border bg-gray-800 border-gray-600 hover:border-gray-500 transition-all"
              >
                <div class="flex items-center justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-3">
                      <div class="text-white font-medium">{{ prompt.name }}</div>
                      <div v-if="settings.defaultSystemPrompt === prompt.id" class="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                        Default
                      </div>
                    </div>
                    <div class="text-sm text-gray-400 mt-1">{{ prompt.description || 'No description' }}</div>
                    <div class="text-xs text-gray-500 mt-1">
                      {{ prompt.content.length }} characters
                    </div>
                  </div>
                  <div class="flex gap-2 ml-4">
                    <button
                      v-if="settings.defaultSystemPrompt !== prompt.id"
                      @click="setDefaultSystemPrompt(prompt.id)"
                      class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                      title="Set as default"
                    >
                      Set as default
                    </button>
                    <button
                      @click="editSystemPrompt(index)"
                      class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                      title="Edit"
                    >
                      Edit
                    </button>
                    <button
                      @click="deleteSystemPrompt(index)"
                      class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                      title="Delete"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Empty State -->
            <div v-else class="text-center py-8">
              <div class="text-gray-400 mb-4">No custom system prompts configured</div>
              <button
                @click="startNewSystemPrompt"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Create Your First Prompt
              </button>
            </div>

            <!-- System Prompt Form (conditionally shown) -->
            <div v-if="showSystemPromptForm" class="bg-gray-800 rounded-lg p-4 border border-gray-600 mt-6" data-add-prompt-form>
              <h3 class="text-lg font-medium text-white mb-4">
                {{ isEditingSystemPrompt ? 'Edit System Prompt' : 'Create New System Prompt' }}
              </h3>
              
              <div class="space-y-4">
                <!-- Basic Information -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-200 mb-2">Name *</label>
                    <input
                      type="text"
                      v-model="settings.newSystemPrompt.name"
                      placeholder="My Custom Assistant"
                      class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium text-gray-200 mb-2">Description</label>
                    <input
                      type="text"
                      v-model="settings.newSystemPrompt.description"
                      placeholder="Brief description of this prompt"
                      class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <!-- System Prompt Content -->
                <div>
                  <label class="block text-sm font-medium text-gray-200 mb-2">System Prompt *</label>
                  <textarea
                    v-model="settings.newSystemPrompt.content"
                    placeholder="You are a helpful AI assistant..."
                    rows="10"
                    class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical font-mono text-sm"
                  ></textarea>
                  <p class="text-xs text-gray-400 mt-2">This defines how the AI should behave and respond</p>
                </div>

                <!-- Action Buttons -->
                <div class="flex gap-2 pt-4">
                  <button
                    @click="addSystemPrompt"
                    :disabled="!canAddSystemPrompt"
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {{ isEditingSystemPrompt ? 'Update Prompt' : 'Create Prompt' }}
                  </button>
                  
                  <button
                    @click="cancelSystemPromptEdit"
                    class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between p-6 border-t border-white/10">
        <p class="text-sm text-gray-400">Settings are saved automatically</p>
        <button
          @click="handleClose"
          :disabled="!canSave"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>