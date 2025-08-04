class ChatHistoryService {
  constructor() {
    this.dbName = 'AIChatHistory';
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
      };
    });
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async createChat(title = 'New Chat') {
    const chat = {
      id: this.generateId(),
      title,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['chats'], 'readwrite');
      const store = transaction.objectStore('chats');
      const request = store.add(chat);
      
      request.onsuccess = () => resolve(chat);
      request.onerror = () => reject(request.error);
    });
  }

  async updateChat(chatId, updates) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['chats'], 'readwrite');
      const store = transaction.objectStore('chats');
      
      const getRequest = store.get(chatId);
      getRequest.onsuccess = () => {
        const chat = getRequest.result;
        if (chat) {
          Object.assign(chat, updates, { updatedAt: new Date().toISOString() });
          const putRequest = store.put(chat);
          putRequest.onsuccess = () => resolve(chat);
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve(null);
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async saveMessages(chatId, messages) {
    // Ensure messages are serializable by creating clean copies
    const cleanMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      answerIndex: msg.answerIndex
    }));
    return this.updateChat(chatId, { messages: cleanMessages });
  }

  async getChat(chatId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['chats'], 'readonly');
      const store = transaction.objectStore('chats');
      const request = store.get(chatId);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllChats() {
    const transaction = this.db.transaction(['chats'], 'readonly');
    const store = transaction.objectStore('chats');
    const index = store.index('updatedAt');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev');
      const chats = [];
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          chats.push(cursor.value);
          cursor.continue();
        } else {
          resolve(chats);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async deleteChat(chatId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['chats'], 'readwrite');
      const store = transaction.objectStore('chats');
      const request = store.delete(chatId);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async updateChatTitle(chatId, title) {
    return this.updateChat(chatId, { title });
  }
}

export const chatHistoryService = new ChatHistoryService();