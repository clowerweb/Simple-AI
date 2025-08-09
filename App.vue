<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick, triggerRef } from 'vue';
import Chat from './components/Chat.vue';
import ChatTabs from './components/ChatTabs.vue';
import Progress from './components/Progress.vue';
import Settings from './components/Settings.vue';
import QuickSettings from './components/QuickSettings.vue';
import ArrowRightIcon from './components/icons/ArrowRightIcon.vue';
import StopIcon from './components/icons/StopIcon.vue';
import SettingsIcon from './components/icons/SettingsIcon.vue';
import workerUrl from './worker.js?url';
import apiWorkerUrl from './apiWorker.js?url';
import chatStorage from './services/chatStorage.js';

const isWebGpuAvailable = ref(false);
const STICKY_SCROLL_THRESHOLD = 120;
const EXAMPLES = [
  'Solve the equation x^2 - 3x + 2 = 0',
  'Lily is three times older than her son. In 15 years, she will be twice as old as him. How old was she when he was born, and how old is she now?',
  'Write python code to compute the nth fibonacci number.',
];

const worker = ref(null);
const textareaRef = ref(null);
const chatContainerRef = ref(null);
const settingsOpen = ref(false);
const currentSettings = ref({
  provider: 'local',
  localModel: 'onnx-community/Qwen3-4B-ONNX',
  customApis: [],
  selectedCustomApi: null,
  defaultCustomApi: null,
  systemPrompts: []
});

const status = ref(null);
const loadingMessage = ref('');
const progressItems = ref([]);
const isRunning = ref(false);

const input = ref('');
const messages = ref([]);
const tps = ref(null);
const numTokens = ref(null);

const chats = ref([]);
const currentChatId = ref(null);
const sidebarCollapsed = ref(false);
const isLoadingHistory = ref(false);
const currentSystemPromptId = ref('');
const currentChatProvider = ref('local');
const currentChatSelectedCustomApi = ref(null);

const onEnter = async (message) => {
  const userMessage = { role: 'user', content: message };
  messages.value.push(userMessage);
  
  if (currentChatId.value) {
    try {
      await chatStorage.saveMessage(currentChatId.value, userMessage);
      await updateChatsList();
    } catch (error) {
      console.error('Failed to save user message:', error);
    }
  }
  
  tps.value = null;
  isRunning.value = true;
  input.value = '';
};

const handleEnter = () => {
  if (input.value.length > 0 && !isRunning.value) {
    onEnter(input.value);
  }
};

const onInterrupt = () => {
  worker.value.postMessage({ type: 'interrupt' });
};

const resizeInput = () => {
  if (!textareaRef.value) return;
  const target = textareaRef.value;
  target.style.height = 'auto';
  const newHeight = Math.min(Math.max(target.scrollHeight, 24), 200);
  target.style.height = `${newHeight}px`;
};

const onMessageReceived = async (e) => {
  switch (e.data.status) {
    case 'loading':
      status.value = 'loading';
      loadingMessage.value = e.data.data;
      break;
    case 'initiate':
      progressItems.value.push(e.data);
      break;
    case 'progress':
      progressItems.value = progressItems.value.map((item) => {
        if (item.file === e.data.file) {
          return { ...item, ...e.data };
        }
        return item;
      });
      break;
    case 'done':
      progressItems.value = progressItems.value.filter(
        (item) => item.file !== e.data.file
      );
      break;
    case 'ready':
      status.value = 'ready';
      break;
    case 'start':
      messages.value.push({ role: 'assistant', content: '', reasoning: '' });
      break;
    case 'update':
      const { output, reasoning, fullReasoning, tps: newTps, numTokens: newNumTokens, state } = e.data;
      tps.value = newTps;
      numTokens.value = newNumTokens;
      const lastMessageIndex = messages.value.length - 1;
      const lastMessage = messages.value[lastMessageIndex];
      
      if (lastMessage.answerIndex === undefined && state === 'answering') {
        lastMessage.answerIndex = lastMessage.content.length;
      }
      
      // Try multiple approaches to force Vue reactivity
      const newContent = lastMessage.content + (output || '');
      const newReasoning = fullReasoning || (lastMessage.reasoning + (reasoning || ''));
      
      // Approach 1: Replace the entire array
      messages.value = [
        ...messages.value.slice(0, lastMessageIndex),
        {
          ...lastMessage,
          content: newContent,
          reasoning: newReasoning
        }
      ];
      
      // Force reactivity trigger
      triggerRef(messages);
      
      // Test: Force a DOM update by changing a simple value
      numTokens.value = newNumTokens;
      break;
    case 'complete':
      isRunning.value = false;
      if (currentChatId.value && messages.value.length > 0) {
        const lastMessage = messages.value[messages.value.length - 1];
        if (lastMessage.role === 'assistant' && lastMessage.content) {
          try {
            await chatStorage.saveMessage(currentChatId.value, lastMessage);
            await updateChatsList();
          } catch (error) {
            console.error('Failed to save assistant message:', error);
          }
        }
      }
      break;
    case 'error':
      isRunning.value = false;
      
      // Replace the last assistant message (the placeholder) with the error message
      const errorMessageIndex = messages.value.length - 1;
      if (errorMessageIndex >= 0 && messages.value[errorMessageIndex].role === 'assistant') {
        // Handle structured error from API worker
        if (typeof e.data.data === 'object' && e.data.data.message) {
          const errorData = e.data.data;
          const errorMessage = {
            role: 'assistant',
            content: errorData.message,
            isError: true,
            isRetryable: errorData.isRetryable,
            errorType: errorData.errorType,
            errorDetails: errorData.details
          };
          
          // Replace the placeholder message
          messages.value = [
            ...messages.value.slice(0, errorMessageIndex),
            errorMessage
          ];
        } else {
          // Handle simple string errors (backward compatibility)
          const errorMessage = {
            role: 'assistant',
            content: e.data.data || 'An unknown error occurred',
            isError: true,
            isRetryable: true,
            errorType: 'unknown'
          };
          
          // Replace the placeholder message
          messages.value = [
            ...messages.value.slice(0, errorMessageIndex),
            errorMessage
          ];
        }
        
        // Save the error message to IndexedDB
        if (currentChatId.value) {
          try {
            await chatStorage.saveMessage(currentChatId.value, messages.value[errorMessageIndex]);
            await updateChatsList();
          } catch (error) {
            console.error('Failed to save error message:', error);
          }
        }
      }
      break;
  }
};

const onErrorReceived = (e) => {
  console.error('Worker error:', e);
};

const initializeWorker = () => {
  if (worker.value) {
    worker.value.removeEventListener('message', onMessageReceived);
    worker.value.removeEventListener('error', onErrorReceived);
    worker.value.terminate();
  }

  // Choose worker based on provider type
  const workerType = effectiveSettings.value.provider === 'local' ? workerUrl : apiWorkerUrl;
  
  worker.value = new Worker(workerType, {
    type: 'module',
  });

  worker.value.addEventListener('message', onMessageReceived);
  worker.value.addEventListener('error', onErrorReceived);

  if (effectiveSettings.value.provider === 'local') {
    worker.value.postMessage({ type: 'check' });
    if (isWebGpuAvailable.value === true) {
      loadModel();
    }
  } else {
    // For API providers, initialize with settings including system prompt (convert to plain object)
    const settingsWithPrompt = {
      ...effectiveSettings.value,
      currentSystemPromptId: currentSystemPromptId.value,
      currentSystemPrompt: getCurrentSystemPrompt.value
    };
    worker.value.postMessage({ type: 'init', data: JSON.parse(JSON.stringify(settingsWithPrompt)) });
  }
};

const loadSettings = () => {
  const stored = localStorage.getItem('ai-chat-settings');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      currentSettings.value = { ...currentSettings.value, ...parsed };
    } catch (e) {
      console.warn('Failed to parse stored settings:', e);
    }
  }
};

const onSettingsChanged = (newSettings) => {
  // Update current settings
  currentSettings.value = newSettings;
  
  // Always reinitialize worker when settings change from Settings modal
  // This ensures the new settings take effect immediately
  status.value = null;
  initializeWorker();
};

const onQuickSettingsChanged = async (newSettings) => {
  // Update per-chat provider settings
  currentChatProvider.value = newSettings.provider;
  currentChatSelectedCustomApi.value = newSettings.selectedCustomApi;
  
  // Save the provider settings for the current chat
  if (currentChatId.value) {
    try {
      await chatStorage.updateChatProvider(currentChatId.value, newSettings.provider, newSettings.selectedCustomApi);
    } catch (error) {
      console.error('Failed to save provider settings for chat:', error);
    }
  }
  
  // Reinitialize worker with the new settings
  status.value = null;
  initializeWorker();
};

onMounted(async () => {
  isWebGpuAvailable.value = !!navigator.gpu;
  loadSettings();
  await initializeChatStorage();
  // Don't initialize worker here - it will be initialized when the first chat is selected/created
  
  // Scroll to bottom after initial load
  await nextTick(() => {
    scrollToBottom();
  });
});

onUnmounted(() => {
  if (worker.value) {
    worker.value.removeEventListener('message', onMessageReceived);
    worker.value.removeEventListener('error', onErrorReceived);
  }
});

watch(messages, () => {
  // Don't trigger generation when loading history
  if (isLoadingHistory.value) {
    return;
  }

  if (messages.value.filter((x) => x.role === 'user').length === 0) {
    return;
  }

  if (messages.value[messages.value.length - 1].role === 'assistant') {
    return;
  }

  tps.value = null;
  worker.value.postMessage({ type: 'generate', data: JSON.parse(JSON.stringify(messages.value)) });
}, { deep: true });

// Watch for when we finish loading history to scroll to bottom
watch(isLoadingHistory, (newVal, oldVal) => {
  if (oldVal === true && newVal === false) {
    // We just finished loading history, scroll to bottom
    nextTick(() => {
      scrollToBottom();
    });
  }
});

watch([messages, isRunning], () => {
  if (!chatContainerRef.value || !isRunning.value) return;

  nextTick(() => {
    const element = chatContainerRef.value;

    if (
      element.scrollHeight - element.scrollTop - element.clientHeight <
      STICKY_SCROLL_THRESHOLD
    ) {
      element.scrollTop = element.scrollHeight;
    }
  });
});

// Watch for chat changes to scroll to bottom
watch(currentChatId, () => {
  nextTick(() => {
    setTimeout(() => {
      scrollToBottom();
    }, 500);
  });
});

const loadModel = () => {
  const settingsWithPrompt = {
    ...effectiveSettings.value,
    currentSystemPromptId: currentSystemPromptId.value,
    currentSystemPrompt: getCurrentSystemPrompt.value
  };
  
  if (effectiveSettings.value.provider === 'local') {
    worker.value.postMessage({ 
      type: 'load', 
      data: effectiveSettings.value.localModel,
      systemPrompt: JSON.parse(JSON.stringify(getCurrentSystemPrompt.value))
    });
  } else {
    worker.value.postMessage({ 
      type: 'init', 
      data: JSON.parse(JSON.stringify(settingsWithPrompt))
    });
  }
  status.value = 'loading';
};

const reset = async () => {
  worker.value.postMessage({ type: 'reset' });
  messages.value = [];
  if (currentChatId.value) {
    await chatStorage.clearMessages(currentChatId.value);
  }
};

const initializeChatStorage = async () => {
  try {
    await chatStorage.init();
    await loadChats();
  } catch (error) {
    console.error('Failed to initialize chat storage:', error);
  }
};

const loadChats = async () => {
  try {
    chats.value = await chatStorage.getAllChats();
    if (chats.value.length === 0) {
      await createNewChat();
    } else {
      // Load the first chat and its settings
      await selectChat(chats.value[0].id);
      // Ensure we scroll to bottom after loading
      await nextTick();
      scrollToBottom();
    }
  } catch (error) {
    console.error('Failed to load chats:', error);
  }
};

const loadCurrentChat = async () => {
  if (!currentChatId.value) return;
  try {
    isLoadingHistory.value = true;
    messages.value = await chatStorage.getMessages(currentChatId.value);
    isLoadingHistory.value = false;
    await nextTick();
    scrollToBottom();
  } catch (error) {
    console.error('Failed to load chat messages:', error);
    messages.value = [];
    isLoadingHistory.value = false;
  }
};

const scrollToBottom = () => {
  if (chatContainerRef.value) {
    // Use requestAnimationFrame to ensure DOM is fully updated
    requestAnimationFrame(() => {
      if (chatContainerRef.value) {
        chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight;
      }
    });
  }
};

const createNewChat = async () => {
  try {
    const defaultPromptId = currentSettings.value.defaultSystemPrompt || '';
    
    const newChat = await chatStorage.createChat('New Chat', defaultPromptId);
    chats.value.unshift(newChat);
    currentChatId.value = newChat.id;
    messages.value = [];
    tps.value = null;
    numTokens.value = null;
    
    // Set system prompt to default for new chats
    currentSystemPromptId.value = defaultPromptId;
    
    // Apply default provider and model settings for new chats
    if (currentSettings.value.defaultCustomApi !== null) {
      // Use default custom API if one is set
      currentChatProvider.value = 'custom';
      currentChatSelectedCustomApi.value = currentSettings.value.defaultCustomApi;
    } else {
      // Fall back to local model
      currentChatProvider.value = 'local';
      currentChatSelectedCustomApi.value = null;
    }
    
    // Initialize worker with default settings
    initializeWorker();
    
    // Scroll to bottom for new chat
    nextTick(() => {
      scrollToBottom();
    });
  } catch (error) {
    console.error('Failed to create new chat:', error);
  }
};

const selectChat = async (chatId) => {
  if (chatId === currentChatId.value) return;
  currentChatId.value = chatId;
  
  // Load the chat's settings (system prompt and provider/model)
  try {
    const chat = await chatStorage.getChat(chatId);
    if (chat) {
      // Load system prompt
      if (chat.systemPromptId !== undefined) {
        currentSystemPromptId.value = chat.systemPromptId;
      } else {
        currentSystemPromptId.value = currentSettings.value.defaultSystemPrompt || '';
      }
      
      // Load provider settings - use chat-specific if available, otherwise use defaults
      if (chat.provider !== undefined) {
        currentChatProvider.value = chat.provider;
        currentChatSelectedCustomApi.value = chat.selectedCustomApi || null;
      } else {
        // Use default settings for chats created before this feature
        if (currentSettings.value.defaultCustomApi !== null) {
          currentChatProvider.value = 'custom';
          currentChatSelectedCustomApi.value = currentSettings.value.defaultCustomApi;
        } else {
          currentChatProvider.value = 'local';
          currentChatSelectedCustomApi.value = null;
        }
      }
    } else {
      // Fallback to user's defaults
      currentSystemPromptId.value = currentSettings.value.defaultSystemPrompt || '';
      if (currentSettings.value.defaultCustomApi !== null) {
        currentChatProvider.value = 'custom';
        currentChatSelectedCustomApi.value = currentSettings.value.defaultCustomApi;
      } else {
        currentChatProvider.value = 'local';
        currentChatSelectedCustomApi.value = null;
      }
    }
  } catch (error) {
    console.error('Failed to load chat settings:', error);
    currentSystemPromptId.value = currentSettings.value.defaultSystemPrompt || '';
    if (currentSettings.value.defaultCustomApi !== null) {
      currentChatProvider.value = 'custom';
      currentChatSelectedCustomApi.value = currentSettings.value.defaultCustomApi;
    } else {
      currentChatProvider.value = 'local';
      currentChatSelectedCustomApi.value = null;
    }
  }
  
  await loadCurrentChat();
  tps.value = null;
  numTokens.value = null;
  
  // Reinitialize worker with chat-specific settings
  initializeWorker();
  
  // Scroll to bottom after selecting chat
  nextTick(() => {
    scrollToBottom();
  });
};

const deleteChat = async (chatId) => {
  if (chats.value.length <= 1) return;
  
  try {
    await chatStorage.deleteChat(chatId);
    chats.value = chats.value.filter(chat => chat.id !== chatId);
    
    if (currentChatId.value === chatId) {
      currentChatId.value = chats.value[0].id;
      await loadCurrentChat();
    }
  } catch (error) {
    console.error('Failed to delete chat:', error);
  }
};

const renameChat = async (chatId, newTitle) => {
  try {
    await chatStorage.updateChat(chatId, { title: newTitle });
    const chatIndex = chats.value.findIndex(chat => chat.id === chatId);
    if (chatIndex !== -1) {
      chats.value[chatIndex].title = newTitle;
    }
  } catch (error) {
    console.error('Failed to rename chat:', error);
  }
};

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
};

const updateChatsList = async () => {
  try {
    chats.value = await chatStorage.getAllChats();
  } catch (error) {
    console.error('Failed to update chats list:', error);
  }
};

// Built-in system prompt
const DEFAULT_SYSTEM_PROMPT = {
  id: '',
  name: 'Helpful Assistant',
  content: 'Be a helpful assistant',
  description: 'Generic helpful assistant',
  isBuiltIn: true
};

// System Prompt helpers
const getAllSystemPrompts = computed(() => {
  return [DEFAULT_SYSTEM_PROMPT, ...currentSettings.value.systemPrompts];
});

const getSystemPromptById = (id) => {
  return getAllSystemPrompts.value.find(p => p.id === id);
};

const getCurrentSystemPrompt = computed(() => {
  // First, try to get the prompt by the current chat's selection or the default setting
  const promptId = currentSystemPromptId.value || currentSettings.value.defaultSystemPrompt || '';
  const prompt = getSystemPromptById(promptId);
  
  if (prompt) {
    return prompt;
  }
  
  // Fallback to built-in if nothing else works
  return DEFAULT_SYSTEM_PROMPT;
});

const getCurrentModelName = computed(() => {
  if (currentChatProvider.value === 'local') {
    return 'Qwen3 4B (Local)';
  } else if (currentChatProvider.value === 'custom' && currentChatSelectedCustomApi.value !== null) {
    const api = currentSettings.value.customApis[currentChatSelectedCustomApi.value];
    return api ? api.name : 'Custom API';
  }
  return 'No Model';
});

const getCurrentProviderName = computed(() => {
  if (currentChatProvider.value === 'local') {
    return 'Local';
  } else if (currentChatProvider.value === 'custom' && currentChatSelectedCustomApi.value !== null) {
    const api = currentSettings.value.customApis[currentChatSelectedCustomApi.value];
    const providers = currentSettings.value.providers;
    const currentProvider = providers.filter((p) => p.id === api.providerId);

    return currentProvider.length ? currentProvider[0].name : 'No Provider';
  }
  return 'No Model';
});

// Computed property that combines global settings with per-chat overrides
const effectiveSettings = computed(() => {
  return {
    ...currentSettings.value,
    provider: currentChatProvider.value,
    selectedCustomApi: currentChatSelectedCustomApi.value
  };
});

const setSystemPrompt = async (promptId) => {
  currentSystemPromptId.value = promptId;
  
  // Save the system prompt for the current chat
  if (currentChatId.value) {
    try {
      await chatStorage.updateChatSystemPrompt(currentChatId.value, promptId);
    } catch (error) {
      console.error('Failed to save system prompt for chat:', error);
    }
  }
};

const retryLastMessage = async () => {
  if (isRunning.value || messages.value.length === 0) return;
  
  // Find the last error message and remove only that one
  const lastErrorIndex = messages.value.length - 1;
  if (lastErrorIndex >= 0 && messages.value[lastErrorIndex].isError) {
    // Remove only the last error message from the UI
    messages.value = messages.value.slice(0, lastErrorIndex);
    
    // Update the chat in IndexedDB by removing only the last error message
    if (currentChatId.value) {
      try {
        // Clear all messages and re-save the non-error messages
        await chatStorage.clearMessages(currentChatId.value);
        for (const message of messages.value) {
          await chatStorage.saveMessage(currentChatId.value, message);
        }
        await updateChatsList();
      } catch (error) {
        console.error('Failed to update chat during retry:', error);
      }
    }
    
    // Retry generation with the remaining messages
    tps.value = null;
    isRunning.value = true;
    worker.value.postMessage({ type: 'generate', data: JSON.parse(JSON.stringify(messages.value)) });
  }
};
</script>

<template>
  <div v-if="isWebGpuAvailable || effectiveSettings.provider !== 'local'" class="flex h-screen text-gray-200 bg-gray-900">
    <!-- Sidebar -->
    <ChatTabs
      :chats="chats"
      :currentChatId="currentChatId"
      :isCollapsed="sidebarCollapsed"
      @newChat="createNewChat"
      @selectChat="selectChat"
      @deleteChat="deleteChat"
      @renameChat="renameChat"
      @toggleSidebar="toggleSidebar"
    />

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col">
      <!-- Loading State -->
      <div v-if="status === 'loading'" class="flex items-center justify-center h-full">
        <div class="w-full max-w-[500px] text-left mx-auto p-6 glass-strong rounded-2xl shadow-2xl relative z-10">
          <p class="text-center mb-4 text-lg font-medium">{{ loadingMessage }}</p>
          <Progress v-for="(item, i) in progressItems" :key="i" :text="item.file" :percentage="item.progress" :total="item.total" />
        </div>
      </div>

      <!-- Chat Interface -->
      <div v-else-if="status === 'ready'" class="flex flex-col h-full">
        <!-- Header with Settings Button -->
        <div class="flex justify-end p-4">
          <button
            @click="settingsOpen = true"
            class="p-3 glass-strong rounded-xl hover:bg-white/10 transition-all duration-300 shadow-lg hover:shadow-xl border border-white/20 hover:border-white/30"
            title="Settings"
          >
            <SettingsIcon class="w-6 h-6 text-gray-300" />
          </button>
        </div>

        <!-- Chat Messages -->
        <div ref="chatContainerRef" class="flex-1 overflow-y-auto scrollbar-thin">
          <div class="max-w-[960px] mx-auto w-full">
            <Chat :messages="messages" @retry="retryLastMessage" />

            <div v-if="messages.length === 0" class="flex flex-col items-center justify-center p-8">
              <div class="mb-8">
                <div v-for="(msg, i) in EXAMPLES" :key="i" class="m-2 glass-strong rounded-xl p-4 cursor-pointer hover:bg-white/10 transition-all duration-300 shadow-lg hover:shadow-xl hover-lift group border border-white/20 hover:border-white/30" @click="onEnter(msg)">
                  {{ msg }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Stats -->
        <div class="px-4 py-2">
          <p class="text-center text-sm min-h-6 text-gray-300">
            <template v-if="tps && messages.length > 0">
              <span v-if="!isRunning">
                {{ numTokens }} tokens, {{ (numTokens / tps).toFixed(2) }} seconds
              </span>

              <span class="mr-1">
                <span class="font-medium text-white mr-1">({{ tps.toFixed(2) }}</span>
                <span class="font-normal text-gray-300">tokens/sec).</span>
              </span>

              <template v-if="!isRunning">
                <span class="underline cursor-pointer" @click="reset">Reset</span>
              </template>
            </template>
          </p>
        </div>

        
        <!-- Input Area -->
        <div class="p-4 pt-0">
          <div class="glass-strong rounded-2xl w-full max-w-[600px] mx-auto relative shadow-2xl hover:shadow-3xl transition-all duration-300 border border-white/20 hover:border-white/30 z-50">
            <!-- Textarea Container -->
            <div class="relative flex">
              <textarea
                id="prompt"
                ref="textareaRef"
                class="scrollbar-thin flex-1 px-4 py-4 bg-transparent border-none outline-none disabled:text-gray-400 text-gray-200 placeholder-gray-400 disabled:placeholder-gray-200 resize-none disabled:cursor-not-allowed"
                placeholder="Type your message..."
                rows="1"
                v-model="input"
                :disabled="status !== 'ready'"
                :title="status === 'ready' ? 'Model is ready' : 'Model not loaded yet'"
                @keydown.enter.prevent="handleEnter"
                @input="resizeInput"
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
                spellcheck="false"
                style="max-height: 200px;"
              ></textarea>
              
              <!-- Send Button Container -->
              <div class="flex items-end pb-3 pr-3">
                <div v-if="isRunning" class="cursor-pointer group" @click="onInterrupt">
                  <StopIcon class="h-8 w-8 p-1 rounded-xl text-red-500 hover:text-red-600 transition-colors duration-200 hover:bg-red-900/20" />
                </div>
                <div v-else-if="input.length > 0" class="cursor-pointer group" @click="onEnter(input)">
                  <ArrowRightIcon class="h-8 w-8 p-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all duration-200 shadow-md hover:shadow-lg" />
                </div>
                <div v-else>
                  <ArrowRightIcon class="h-8 w-8 p-1 bg-gray-600 text-gray-400 rounded-xl" />
                </div>
              </div>
            </div>
            
            <!-- Bottom Controls Bar -->
            <div class="flex items-center justify-between px-4 pb-3 pt-1 border-t border-white/10">
              <div class="flex items-center gap-2">
                <QuickSettings
                  :currentSettings="effectiveSettings"
                  :currentSystemPromptId="currentSystemPromptId"
                  :getAllSystemPrompts="getAllSystemPrompts"
                  :getCurrentSystemPrompt="getCurrentSystemPrompt"
                  :setSystemPrompt="setSystemPrompt"
                  :loadModel="loadModel"
                  @settingsChanged="onQuickSettingsChanged"
                />
              </div>
              <div class="text-xs text-gray-500">
                {{ getCurrentSystemPrompt?.name || 'No prompt' }} • {{ getCurrentModelName }} • {{ getCurrentProviderName }}
              </div>
            </div>
          </div>

          <p class="text-xs text-gray-400 text-center mt-4 glass rounded-full px-4 py-2 border border-white/10 mx-auto max-w-fit relative z-[1]">
            ⚠️ Generated content may be inaccurate or false.
          </p>
        </div>
      </div>
    </div>

    <!-- Settings Modal -->
    <Settings
      :modelOpen="settingsOpen"
      @close="settingsOpen = false"
      @settingsChanged="onSettingsChanged"
    />
  </div>

  <div v-else class="fixed w-screen h-screen bg-gradient-to-br from-red-900 to-gray-900 z-10 text-white text-2xl font-semibold flex flex-col justify-center items-center text-center p-8">
    <div class="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20">
      <div class="text-4xl mb-4">🚫</div>
      <div class="text-xl mb-2">WebGPU Not Supported</div>
      <div class="text-gray-300 text-base mb-4">Your browser doesn't support WebGPU technology for local models</div>
      <button
        @click="settingsOpen = true"
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
      >
        Use API Provider Instead
      </button>
    </div>

    <!-- Settings Modal for fallback case -->
    <Settings
      :modelOpen="settingsOpen"
      @close="settingsOpen = false"
      @settingsChanged="onSettingsChanged"
    />
  </div>
</template>
