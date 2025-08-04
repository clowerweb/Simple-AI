import { ref, computed, watch } from 'vue';
import { chatHistoryService } from '../services/chatHistoryService.js';

const chats = ref([]);
const activeTabId = ref(null);
const isInitialized = ref(false);
const isUpdatingMessages = ref(false);

export function useChatTabs() {
  const activeChat = computed(() => {
    return chats.value.find(chat => chat.id === activeTabId.value) || null;
  });

  const activeMessages = computed(() => {
    return activeChat.value?.messages || [];
  });

  const initialize = async () => {
    if (isInitialized.value) return;
    
    try {
      await chatHistoryService.init();
      await loadChats();
      
      if (chats.value.length === 0) {
        await createNewChat();
      } else {
        activeTabId.value = chats.value[0].id;
      }
      
      isInitialized.value = true;
    } catch (error) {
      console.error('Failed to initialize chat tabs:', error);
    }
  };

  const loadChats = async () => {
    try {
      const loadedChats = await chatHistoryService.getAllChats();
      chats.value = loadedChats;
    } catch (error) {
      console.error('Failed to load chats:', error);
    }
  };

  const createNewChat = async (title) => {
    try {
      const newChat = await chatHistoryService.createChat(title);
      chats.value.unshift(newChat);
      activeTabId.value = newChat.id;
      return newChat;
    } catch (error) {
      console.error('Failed to create new chat:', error);
    }
  };

  const switchToTab = (chatId) => {
    const chat = chats.value.find(c => c.id === chatId);
    if (chat) {
      activeTabId.value = chatId;
    }
  };

  const closeTab = async (chatId) => {
    try {
      await chatHistoryService.deleteChat(chatId);
      const index = chats.value.findIndex(c => c.id === chatId);
      
      if (index !== -1) {
        chats.value.splice(index, 1);
        
        if (activeTabId.value === chatId) {
          if (chats.value.length > 0) {
            const newActiveIndex = Math.min(index, chats.value.length - 1);
            activeTabId.value = chats.value[newActiveIndex].id;
          } else {
            await createNewChat();
          }
        }
      }
    } catch (error) {
      console.error('Failed to close tab:', error);
    }
  };

  const updateMessages = async (messages) => {
    if (!activeTabId.value || isUpdatingMessages.value) return;
    
    try {
      isUpdatingMessages.value = true;
      const updatedChat = await chatHistoryService.saveMessages(activeTabId.value, messages);
      
      const index = chats.value.findIndex(c => c.id === activeTabId.value);
      if (index !== -1 && updatedChat) {
        chats.value[index] = updatedChat;
      }
    } catch (error) {
      console.error('Failed to update messages:', error);
    } finally {
      isUpdatingMessages.value = false;
    }
  };

  const updateChatTitle = async (chatId, title) => {
    try {
      const updatedChat = await chatHistoryService.updateChatTitle(chatId, title);
      
      const index = chats.value.findIndex(c => c.id === chatId);
      if (index !== -1 && updatedChat) {
        chats.value[index] = updatedChat;
      }
    } catch (error) {
      console.error('Failed to update chat title:', error);
    }
  };

  const generateTitleFromFirstMessage = (messages) => {
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      const content = firstUserMessage.content.trim();
      if (content.length > 30) {
        return content.substring(0, 30) + '...';
      }
      return content;
    }
    return 'New Chat';
  };

  watch(activeMessages, async (newMessages) => {
    if (!isUpdatingMessages.value && newMessages.length > 0 && activeChat.value?.title === 'New Chat') {
      const newTitle = generateTitleFromFirstMessage(newMessages);
      await updateChatTitle(activeChat.value.id, newTitle);
    }
  }, { deep: true });

  return {
    chats: computed(() => chats.value),
    activeTabId: computed(() => activeTabId.value),
    activeChat,
    activeMessages,
    isInitialized: computed(() => isInitialized.value),
    initialize,
    createNewChat,
    switchToTab,
    closeTab,
    updateMessages,
    updateChatTitle
  };
}