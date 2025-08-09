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
  PROMPTS: 'prompts',
  PREFERENCES: 'preferences'
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

// Inline editing state
const expandedProviderId = ref(null);
const expandedApiIndex = ref(null);
const expandedPromptId = ref(null);

// New API form accordion state
const showAdvancedParams = ref(false);

// Preferences state
const includeApiKeys = ref(false);
const includeChatHistory = ref(false);
const showClearConfirm = ref(false);
const showImportConfirm = ref(false);
const importFileContent = ref(null);

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
  expandedApiIndex.value = null;
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
  // Scroll to form after it's rendered
  nextTick(() => {
    const formElement = document.querySelector('[data-new-api-form]');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
  expandedProviderId.value = null;
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
  // Scroll to form after it's rendered
  nextTick(() => {
    const formElement = document.querySelector('[data-new-provider-form]');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
  expandedPromptId.value = null;
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
  // Scroll to form after it's rendered
  nextTick(() => {
    const formElement = document.querySelector('[data-new-prompt-form]');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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

// Computed properties for alphabetically sorted lists
const sortedProviders = computed(() => {
  return [...settings.value.providers].sort((a, b) => 
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
});

const sortedCustomApis = computed(() => {
  return [...settings.value.customApis].sort((a, b) => 
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
});

const sortedSystemPrompts = computed(() => {
  return [...settings.value.systemPrompts].sort((a, b) => 
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
});

// Inline editing functions
const toggleProviderEdit = (providerId) => {
  if (expandedProviderId.value === providerId) {
    expandedProviderId.value = null;
    cancelProviderEdit();
  } else {
    expandedProviderId.value = providerId;
    const providerIndex = settings.value.providers.findIndex(p => p.id === providerId);
    if (providerIndex !== -1) {
      editProvider(providerIndex);
    }
    // Scroll to the item after it's expanded
    nextTick(() => {
      const itemElement = document.querySelector(`[data-provider-id="${providerId}"]`);
      if (itemElement) {
        itemElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
};

const toggleApiEdit = (apiIndex) => {
  if (expandedApiIndex.value === apiIndex) {
    expandedApiIndex.value = null;
    cancelEdit();
  } else {
    expandedApiIndex.value = apiIndex;
    editCustomApi(apiIndex);
    // Scroll to the item after it's expanded
    nextTick(() => {
      const itemElement = document.querySelector(`[data-api-index="${apiIndex}"]`);
      if (itemElement) {
        itemElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
};

const togglePromptEdit = (promptId) => {
  if (expandedPromptId.value === promptId) {
    expandedPromptId.value = null;
    cancelSystemPromptEdit();
  } else {
    expandedPromptId.value = promptId;
    const promptIndex = settings.value.systemPrompts.findIndex(p => p.id === promptId);
    if (promptIndex !== -1) {
      editSystemPrompt(promptIndex);
    }
    // Scroll to the item after it's expanded
    nextTick(() => {
      const itemElement = document.querySelector(`[data-prompt-id="${promptId}"]`);
      if (itemElement) {
        itemElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
};

// Preferences functions
const exportSettings = async () => {
  const settingsToExport = { ...settings.value }
  
  if (!includeApiKeys.value) {
    // Remove API keys from providers
    settingsToExport.providers = settingsToExport.providers.map(provider => ({
      ...provider,
      apiKeys: provider.apiKeys.map(key => ({
        ...key,
        key: '' // Clear the actual API key
      }))
    }));
  }
  
  // Include chat history if requested
  if (includeChatHistory.value) {
    try {
      // Import chatStorage to access chat history
      const chatStorage = await import('../services/chatStorage.js');
      await chatStorage.default.init();
      
      // Get all chats and their messages
      const allChats = await chatStorage.default.getAllChats();
      const chatsWithMessages = [];
      
      for (const chat of allChats) {
        const messages = await chatStorage.default.getMessages(chat.id);
        chatsWithMessages.push({
          ...chat,
          messages
        });
      }
      
      settingsToExport.chatHistory = chatsWithMessages;
    } catch (error) {
      console.error('Failed to export chat history:', error);
      alert('Failed to export chat history. Continuing with settings only.');
    }
  }
  
  const dataStr = JSON.stringify(settingsToExport, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  let exportFileDefaultName = 'ai-chat-settings';
  if (includeApiKeys.value) {
    exportFileDefaultName += '-WITH-KEYS';
  }
  if (includeChatHistory.value) {
    exportFileDefaultName += '-WITH-CHATS';
  }
  exportFileDefaultName += '.json';
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
};

const handleImportFile = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const importedSettings = JSON.parse(e.target.result);
      importFileContent.value = importedSettings;
      showImportConfirm.value = true;
    } catch (error) {
      alert('Invalid JSON file. Please select a valid settings export file.');
    }
  };
  reader.readAsText(file);
  
  // Clear the input
  event.target.value = '';
};

const confirmImport = async () => {
  if (importFileContent.value) {
    // Check if chat history is included in the import
    const hasChatHistory = Array.isArray(importFileContent.value.chatHistory);
    
    // Handle chat history import if present
    if (hasChatHistory) {
      try {
        const chatStorage = await import('../services/chatStorage.js');
        await chatStorage.default.init();
        
        // Clear existing chats and messages
        const existingChats = await chatStorage.default.getAllChats();
        for (const chat of existingChats) {
          await chatStorage.default.deleteChat(chat.id);
        }
        
        // Import chats and messages
        for (const chatWithMessages of importFileContent.value.chatHistory) {
          const { messages, ...chatData } = chatWithMessages;
          
          // Create the chat
          const transaction = chatStorage.default.db.transaction(['chats'], 'readwrite');
          const store = transaction.objectStore('chats');
          await new Promise((resolve, reject) => {
            const request = store.add(chatData);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
          
          // Import messages for this chat
          for (const message of messages) {
            const messageWithId = {
              id: chatStorage.default.generateId(),
              chatId: chatData.id,
              timestamp: new Date().toISOString(),
              ...message
            };
            
            const messageTransaction = chatStorage.default.db.transaction(['messages'], 'readwrite');
            const messageStore = messageTransaction.objectStore('messages');
            await new Promise((resolve, reject) => {
              const request = messageStore.add(messageWithId);
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
            });
          }
        }
      } catch (error) {
        console.error('Failed to import chat history:', error);
        alert('Failed to import chat history. Settings imported without chat history.');
      }
    }
    
    // Clear current settings and replace with imported ones (excluding chat history)
    const { chatHistory, ...settingsToImport } = importFileContent.value;
    settings.value = { ...settings.value, ...settingsToImport }
    
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
    
    // Save to localStorage
    saveSettingsToStorage();
    
    showImportConfirm.value = false;
    importFileContent.value = null;
    
    alert(hasChatHistory 
      ? 'Settings and chat history imported successfully!' 
      : 'Settings imported successfully!');
  }
};

const cancelImport = () => {
  showImportConfirm.value = false;
  importFileContent.value = null;
};

const confirmClearAll = () => {
  // Reset to default settings
  settings.value = {
    provider: 'local',
    localModel: 'onnx-community/Qwen3-4B-ONNX',
    providers: [],
    customApis: [],
    selectedCustomApi: null,
    systemPrompts: [],
    defaultSystemPrompt: '',
    defaultProviderId: null,
    defaultCustomApi: null
  };
  
  // Clear from localStorage
  localStorage.removeItem('ai-chat-settings');
  
  showClearConfirm.value = false;
  
  alert('All settings have been cleared!');
};

const cancelClearAll = () => {
  showClearConfirm.value = false;
};

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
        <button
          @click="activeTab = TABS.PREFERENCES"
          :class="[
            'px-6 py-3 text-sm font-medium transition-colors border-b-2',
            activeTab === TABS.PREFERENCES
              ? 'text-blue-400 border-blue-400'
              : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
          ]"
        >
          Preferences
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
                <h3 class="text-lg font-medium text-white">Custom API Models</h3>
                <button
                  @click="startNewApi"
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                  </svg>
                  New Model
                </button>
              </div>

              <!-- APIs Grid -->
              <div v-if="settings.customApis.length > 0" class="space-y-2">
                <div 
                  v-for="api in sortedCustomApis" 
                  :key="api.name" 
                  :data-api-index="settings.customApis.findIndex(a => a === api)"
                  class="rounded-lg border bg-gray-800 border-gray-600 hover:border-gray-500 transition-all"
                >
                  <div 
                    @click="toggleApiEdit(settings.customApis.findIndex(a => a === api))"
                    class="p-4 cursor-pointer"
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex-1">
                        <div class="flex items-center gap-3">
                          <div class="text-white font-medium">{{ api.name }}</div>
                          <div v-if="settings.defaultCustomApi === settings.customApis.findIndex(a => a === api)" class="px-2 py-1 bg-green-600 text-white text-xs rounded-full">
                            Default
                          </div>
                          <div v-if="expandedApiIndex === settings.customApis.findIndex(a => a === api)" class="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                            Editing
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
                          v-if="settings.defaultCustomApi !== settings.customApis.findIndex(a => a === api)"
                          @click="setDefaultCustomApi(settings.customApis.findIndex(a => a === api))"
                          class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                          title="Set as default"
                        >
                          Set as default
                        </button>
                        <button
                          @click="cloneCustomApi(settings.customApis.findIndex(a => a === api))"
                          class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                          title="Clone"
                        >
                          Clone
                        </button>
                        <button
                          @click="deleteCustomApi(settings.customApis.findIndex(a => a === api))"
                          class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                          title="Delete"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Inline Edit Form -->
                  <div v-if="expandedApiIndex === settings.customApis.findIndex(a => a === api)" class="border-t border-gray-700 p-4 bg-gray-900">
                    <h4 class="text-md font-medium text-white mb-4">Edit Model</h4>
                    
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
                      
                      <div>
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
                      <h5 class="text-sm font-medium text-white mb-4">Advanced Parameters</h5>
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- Max Tokens -->
                        <div>
                          <label class="block text-sm font-medium text-gray-200 mb-2">Max Tokens</label>
                          <input
                            type="number"
                            v-model.number="settings.newCustomApi.maxTokens"
                            min="1"
                            max="32768"
                            class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                            class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                        Update API
                      </button>
                      
                      <button
                        @click="toggleApiEdit(settings.customApis.findIndex(a => a === api))"
                        class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                      >
                        Cancel
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
                  Add Your First Model
                </button>
              </div>
            </div>

            <!-- New API Form -->
            <div v-if="showForm" class="bg-gray-800 rounded-lg p-4 border border-gray-600 mt-6" data-new-api-form>
              <h3 class="text-lg font-medium text-white mb-4">Add New Model</h3>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                
                <div>
                  <label class="block text-sm font-medium text-gray-200 mb-2">Model Name (Optional)</label>
                  <input
                    type="text"
                    v-model="settings.newCustomApi.modelName"
                    placeholder="gpt-3.5-turbo"
                    class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <!-- Advanced Parameters Accordion -->
              <div class="mb-4">
                <button
                  @click="showAdvancedParams = !showAdvancedParams"
                  class="flex items-center justify-between w-full p-3 bg-gray-700 rounded-lg text-white hover:bg-gray-600 transition-colors"
                >
                  <span class="font-medium">Advanced Parameters</span>
                  <svg 
                    class="w-5 h-5 transition-transform duration-200"
                    :class="{ 'rotate-180': showAdvancedParams }"
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </button>

                <div v-if="showAdvancedParams" class="mt-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Max Tokens -->
                    <div>
                      <label class="block text-sm font-medium text-gray-200 mb-2">Max Tokens</label>
                      <input
                        type="number"
                        v-model.number="settings.newCustomApi.maxTokens"
                        min="1"
                        max="32768"
                        class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                        class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              </div>

              <div class="flex gap-2">
                <button
                  @click="addCustomApi"
                  :disabled="!canAddCustomApi"
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  Add API
                </button>
                
                <button
                  @click="showForm = false; showAdvancedParams = false"
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
                v-for="provider in sortedProviders" 
                :key="provider.id" 
                :data-provider-id="provider.id"
                class="rounded-lg border bg-gray-800 border-gray-600 hover:border-gray-500 transition-all"
              >
                <div 
                  @click="toggleProviderEdit(provider.id)"
                  class="p-4 cursor-pointer"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-3">
                        <div class="text-white font-medium">{{ provider.name }}</div>
                        <div v-if="settings.defaultProviderId === provider.id" class="px-2 py-1 bg-green-600 text-white text-xs rounded-full">
                          Default
                        </div>
                        <div v-if="expandedProviderId === provider.id" class="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                          Editing
                        </div>
                      </div>
                      <div class="text-sm text-gray-400 mt-1">{{ provider.apiUrl }}</div>
                      <div class="text-xs text-gray-500 mt-1">
                        {{ provider.apiKeys.length }} API key{{ provider.apiKeys.length !== 1 ? 's' : '' }} configured
                      </div>
                    </div>
                    <div class="flex gap-2 ml-4" @click.stop>
                      <button
                        v-if="settings.defaultProviderId !== provider.id"
                        @click="setDefaultProvider(provider.id)"
                        class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                        title="Set as default"
                      >
                        Set as default
                      </button>
                      <button
                        @click="deleteProvider(settings.providers.findIndex(p => p.id === provider.id))"
                        class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Inline Edit Form -->
                <div v-if="expandedProviderId === provider.id" class="border-t border-gray-700 p-4 bg-gray-900">
                  <h4 class="text-md font-medium text-white mb-4">Edit Provider</h4>
                  
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
                          class="p-3 bg-gray-800 rounded-lg border border-gray-700"
                        >
                          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                            <div>
                              <label class="block text-xs font-medium text-gray-300 mb-1">Key Name</label>
                              <input
                                type="text"
                                v-model="apiKey.name"
                                placeholder="Key name"
                                class="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            
                            <div>
                              <label class="block text-xs font-medium text-gray-300 mb-1">API Key</label>
                              <input
                                type="password"
                                v-model="apiKey.key"
                                placeholder="sk-..."
                                class="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            
                            <div class="flex items-center gap-2">
                              <label class="flex items-center cursor-pointer">
                                <input
                                  type="radio"
                                  :name="`default-key-${provider.id}`"
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
                        Update Provider
                      </button>
                      
                      <button
                        @click="toggleProviderEdit(provider.id)"
                        class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
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

            <!-- New Provider Form -->
            <div v-if="showProviderForm" class="bg-gray-800 rounded-lg p-4 border border-gray-600 mt-6" data-new-provider-form>
              <h3 class="text-lg font-medium text-white mb-4">Add New Provider</h3>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
              
              <div>
                <label class="block text-sm font-medium text-gray-200 mb-2">API Key *</label>
                <input
                  type="password"
                  v-model="settings.newProvider.apiKeys[0].key"
                  placeholder="sk-..."
                  class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
                />
              </div>

              <div class="flex gap-2">
                <button
                  @click="addProvider"
                  :disabled="!canAddProvider"
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  Add Provider
                </button>
                
                <button
                  @click="showProviderForm = false"
                  class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
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
                v-for="prompt in sortedSystemPrompts" 
                :key="prompt.id" 
                :data-prompt-id="prompt.id"
                class="rounded-lg border bg-gray-800 border-gray-600 hover:border-gray-500 transition-all"
              >
                <div 
                  @click="togglePromptEdit(prompt.id)"
                  class="p-4 cursor-pointer"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-3">
                        <div class="text-white font-medium">{{ prompt.name }}</div>
                        <div v-if="settings.defaultSystemPrompt === prompt.id" class="px-2 py-1 bg-green-600 text-white text-xs rounded-full">
                          Default
                        </div>
                        <div v-if="expandedPromptId === prompt.id" class="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                          Editing
                        </div>
                      </div>
                      <div class="text-sm text-gray-400 mt-1">{{ prompt.description || 'No description' }}</div>
                      <div class="text-xs text-gray-500 mt-1">
                        {{ prompt.content.length }} characters
                      </div>
                    </div>
                    <div class="flex gap-2 ml-4" @click.stop>
                      <button
                        v-if="settings.defaultSystemPrompt !== prompt.id"
                        @click="setDefaultSystemPrompt(prompt.id)"
                        class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                        title="Set as default"
                      >
                        Set as default
                      </button>
                      <button
                        @click="deleteSystemPrompt(settings.systemPrompts.findIndex(p => p.id === prompt.id))"
                        class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Inline Edit Form -->
                <div v-if="expandedPromptId === prompt.id" class="border-t border-gray-700 p-4 bg-gray-900">
                  <h4 class="text-md font-medium text-white mb-4">Edit System Prompt</h4>
                  
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
                        rows="8"
                        class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical font-mono text-sm"
                      ></textarea>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex gap-2 pt-4">
                      <button
                        @click="addSystemPrompt"
                        :disabled="!canAddSystemPrompt"
                        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                      >
                        Update Prompt
                      </button>
                      
                      <button
                        @click="togglePromptEdit(prompt.id)"
                        class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
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

            <!-- New System Prompt Form -->
            <div v-if="showSystemPromptForm" class="bg-gray-800 rounded-lg p-4 border border-gray-600 mt-6" data-new-prompt-form>
              <h3 class="text-lg font-medium text-white mb-4">Create New System Prompt</h3>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                    placeholder="Brief description"
                    class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-200 mb-2">System Prompt *</label>
                <textarea
                  v-model="settings.newSystemPrompt.content"
                  placeholder="You are a helpful AI assistant..."
                  rows="6"
                  class="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical font-mono text-sm"
                ></textarea>
              </div>

              <div class="flex gap-2">
                <button
                  @click="addSystemPrompt"
                  :disabled="!canAddSystemPrompt"
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  Create Prompt
                </button>
                
                <button
                  @click="showSystemPromptForm = false"
                  class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>

          </div>
        </div>

        <!-- Preferences Tab -->
        <div v-if="activeTab === TABS.PREFERENCES" class="p-6 space-y-6">
          <div class="max-w-2xl">
            <h3 class="text-lg font-medium text-white mb-6">Import & Export Settings</h3>
            
            <!-- Export Settings -->
            <div class="bg-gray-800 rounded-lg p-4 border border-gray-600 mb-6">
              <h4 class="text-md font-medium text-white mb-4">Export Settings</h4>
              <p class="text-sm text-gray-400 mb-4">Download your current settings as a JSON file for backup or sharing.</p>
              
              <!-- Include API Keys Checkbox -->
              <div class="mb-4">
                <label class="flex items-start cursor-pointer">
                  <input
                    type="checkbox"
                    v-model="includeApiKeys"
                    class="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded mt-0.5 mr-3"
                  />
                  <div>
                    <span class="text-white font-medium">Include API keys</span>
                    <div class="text-xs text-orange-400 mt-1 flex items-start">
                      <svg class="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                      </svg>
                      <span><strong>Warning:</strong> Never share exports that contain API keys. Only enable this for personal backups stored securely.</span>
                    </div>
                  </div>
                </label>
              </div>
              
              <!-- Include Chat History Checkbox -->
              <div class="mb-4">
                <label class="flex items-start cursor-pointer">
                  <input
                    type="checkbox"
                    v-model="includeChatHistory"
                    class="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded mt-0.5 mr-3"
                  />
                  <div>
                    <span class="text-white font-medium">Include chat history</span>
                    <div class="text-xs text-orange-400 mt-1 flex items-start">
                      <svg class="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                      </svg>
                      <span><strong>Warning:</strong> Never share exports that contain chats you'd like to keep private. Only enable this for personal backups stored securely.</span>
                    </div>
                  </div>
                </label>
              </div>
              
              <button
                @click="exportSettings"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
                </svg>
                Export Settings
              </button>
            </div>

            <!-- Import Settings -->
            <div class="bg-gray-800 rounded-lg p-4 border border-gray-600 mb-6">
              <h4 class="text-md font-medium text-white mb-4">Import Settings</h4>
              <p class="text-sm text-gray-400 mb-4">Replace your current settings with those from a JSON export file.</p>
              
              <div class="mb-4">
                <input
                  type="file"
                  accept=".json"
                  @change="handleImportFile"
                  class="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer cursor-pointer"
                />
              </div>
            </div>

            <!-- Clear All Settings -->
            <div class="bg-gray-800 rounded-lg p-4 border border-red-600/50">
              <h4 class="text-md font-medium text-white mb-4 flex items-center gap-2">
                <svg class="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                </svg>
                Danger Zone
              </h4>
              <p class="text-sm text-gray-400 mb-4">This will permanently delete all your settings including providers, models, and system prompts.</p>
              
              <button
                @click="showClearConfirm = true"
                class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
                Clear All Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Import Confirmation Modal -->
      <div v-if="showImportConfirm" class="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-10">
        <div class="bg-gray-800 rounded-lg p-6 border border-gray-600 max-w-md w-full mx-4">
          <h3 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <svg class="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
            </svg>
            Confirm Import
          </h3>
          <p class="text-gray-300 mb-6">
            This will <strong class="text-white">replace all your current settings</strong> with the imported ones. 
            All existing providers, models, and system prompts will be lost.
          </p>
          <p v-if="importFileContent && Array.isArray(importFileContent.chatHistory)" class="text-gray-300 mb-6">
            This import also contains <strong class="text-white">chat history</strong> which will replace your current chat history.
          </p>
          <p class="text-gray-400 text-sm mb-6">
            Are you sure you want to continue?
          </p>
          <div class="flex gap-3">
            <button
              @click="confirmImport"
              class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Yes, Replace All Settings
            </button>
            <button
              @click="cancelImport"
              class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- Clear All Confirmation Modal -->
      <div v-if="showClearConfirm" class="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-10">
        <div class="bg-gray-800 rounded-lg p-6 border border-red-600/50 max-w-md w-full mx-4">
          <h3 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <svg class="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
            </svg>
            Clear All Settings
          </h3>
          <p class="text-gray-300 mb-6">
            This will <strong class="text-red-400">permanently delete</strong> all your settings including:
          </p>
          <ul class="text-gray-400 text-sm mb-6 list-disc list-inside space-y-1">
            <li>All API providers and their keys</li>
            <li>All custom models and their configurations</li>
            <li>All custom system prompts</li>
            <li>All default settings</li>
          </ul>
          <p class="text-gray-400 text-sm mb-6">
            <strong class="text-white">This action cannot be undone.</strong> Are you sure you want to continue?
          </p>
          <div class="flex gap-3">
            <button
              @click="confirmClearAll"
              class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Yes, Clear Everything
            </button>
            <button
              @click="cancelClearAll"
              class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between p-6 border-t border-white/10">
        <p class="text-sm text-gray-400">Settings are saved automatically</p>
      </div>
    </div>
  </div>
</template>