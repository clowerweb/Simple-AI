class ChatStorage {
  constructor() {
    this.dbName = 'AIChat';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('chats')) {
          const chatStore = db.createObjectStore('chats', { keyPath: 'id' });
          chatStore.createIndex('createdAt', 'createdAt', { unique: false });
          chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('chatId', 'chatId', { unique: false });
          messageStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async createChat(title = 'New Chat', systemPromptId = null) {
    const chat = {
      id: this.generateId(),
      title,
      systemPromptId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0
    };

    const transaction = this.db.transaction(['chats'], 'readwrite');
    const store = transaction.objectStore('chats');
    await store.add(chat);

    return chat;
  }

  async getAllChats() {
    const transaction = this.db.transaction(['chats'], 'readonly');
    const store = transaction.objectStore('chats');
    const index = store.index('updatedAt');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll();
      request.onsuccess = () => {
        const chats = request.result.sort((a, b) => 
          new Date(b.updatedAt) - new Date(a.updatedAt)
        );
        resolve(chats);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getChat(chatId) {
    const transaction = this.db.transaction(['chats'], 'readonly');
    const store = transaction.objectStore('chats');
    
    return new Promise((resolve, reject) => {
      const request = store.get(chatId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async updateChat(chatId, updates) {
    const chat = await this.getChat(chatId);
    if (!chat) throw new Error('Chat not found');

    const updatedChat = {
      ...chat,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const transaction = this.db.transaction(['chats'], 'readwrite');
    const store = transaction.objectStore('chats');

    return new Promise((resolve, reject) => {
      const request = store.put(updatedChat);
      request.onsuccess = () => resolve(updatedChat);
      request.onerror = () => reject(request.error);
    });
  }

  async updateChatSystemPrompt(chatId, systemPromptId) {
    return this.updateChat(chatId, { systemPromptId });
  }

  async updateChatProvider(chatId, provider, selectedCustomApi = null) {
    return this.updateChat(chatId, { provider, selectedCustomApi });
  }

  async deleteChat(chatId) {
    const transaction = this.db.transaction(['chats', 'messages'], 'readwrite');
    
    const chatStore = transaction.objectStore('chats');
    const messageStore = transaction.objectStore('messages');
    const messageIndex = messageStore.index('chatId');

    const deleteMessages = messageIndex.getAll(chatId);
    deleteMessages.onsuccess = () => {
      deleteMessages.result.forEach(message => {
        messageStore.delete(message.id);
      });
    };

    await chatStore.delete(chatId);
  }

  async saveMessage(chatId, message) {
    const messageWithId = {
      id: this.generateId(),
      chatId,
      timestamp: new Date().toISOString(),
      ...message
    };

    const transaction = this.db.transaction(['messages', 'chats'], 'readwrite');
    const messageStore = transaction.objectStore('messages');
    const chatStore = transaction.objectStore('chats');

    // Add the message
    await new Promise((resolve, reject) => {
      const request = messageStore.add(messageWithId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Get and update the chat
    const chat = await new Promise((resolve, reject) => {
      const request = chatStore.get(chatId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (chat) {
      const updatedChat = {
        ...chat,
        messageCount: chat.messageCount + 1,
        updatedAt: new Date().toISOString(),
        title: chat.messageCount === 0 && message.role === 'user' 
          ? this.generateChatTitle(message.content) 
          : chat.title
      };

      await new Promise((resolve, reject) => {
        const request = chatStore.put(updatedChat);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    return messageWithId;
  }

  async getMessages(chatId) {
    const transaction = this.db.transaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    const index = store.index('chatId');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(chatId);
      request.onsuccess = () => {
        const messages = request.result.sort((a, b) => 
          new Date(a.timestamp) - new Date(b.timestamp)
        );
        resolve(messages.map(({ id, chatId, timestamp, ...message }) => message));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearMessages(chatId) {
    const transaction = this.db.transaction(['messages', 'chats'], 'readwrite');
    const messageStore = transaction.objectStore('messages');
    const chatStore = transaction.objectStore('chats');
    const messageIndex = messageStore.index('chatId');

    const messages = await new Promise((resolve, reject) => {
      const request = messageIndex.getAll(chatId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    messages.forEach(message => {
      messageStore.delete(message.id);
    });

    await this.updateChat(chatId, { messageCount: 0 });
  }

  generateChatTitle(firstMessage) {
    const words = firstMessage.split(' ').slice(0, 5);
    let title = words.join(' ');
    if (title.length > 30) {
      title = title.substring(0, 27) + '...';
    }
    return title || 'New Chat';
  }
}

export default new ChatStorage();