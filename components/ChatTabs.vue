<script setup>
import { ref, computed, onMounted } from 'vue';
import PlusIcon from './icons/PlusIcon.vue';
import ChatIcon from './icons/ChatIcon.vue';
import TrashIcon from './icons/TrashIcon.vue';
import EditIcon from './icons/EditIcon.vue';

const props = defineProps({
  chats: Array,
  currentChatId: String,
  isCollapsed: Boolean
});

const emit = defineEmits(['newChat', 'selectChat', 'deleteChat', 'renameChat', 'toggleSidebar']);

const editingChatId = ref(null);
const editingTitle = ref('');
const editInputRef = ref(null);

const startEditing = (chat) => {
  editingChatId.value = chat.id;
  editingTitle.value = chat.title;
  setTimeout(() => {
    editInputRef.value?.focus();
    editInputRef.value?.select();
  }, 50);
};

const saveEdit = () => {
  if (editingTitle.value.trim()) {
    emit('renameChat', editingChatId.value, editingTitle.value.trim());
  }
  editingChatId.value = null;
  editingTitle.value = '';
};

const cancelEdit = () => {
  editingChatId.value = null;
  editingTitle.value = '';
};

const handleKeydown = (event) => {
  if (event.key === 'Enter') {
    saveEdit();
  } else if (event.key === 'Escape') {
    cancelEdit();
  }
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return date.toLocaleDateString();
};
</script>

<template>
  <div 
    class="bg-gray-900/95 backdrop-blur-sm border-r border-white/10 flex flex-col h-full transition-all duration-300"
    :class="isCollapsed ? 'w-16' : 'w-80'"
  >
    <!-- Header -->
    <div class="p-4 border-b border-white/10">
      <div class="flex items-center justify-between">
        <button
          @click="emit('toggleSidebar')"
          class="p-2 hover:bg-white/10 rounded-lg transition-colors"
          :title="isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        >
          <div class="w-6 h-6 flex flex-col justify-center space-y-1">
            <div class="h-0.5 bg-gray-300 rounded transition-all duration-200" :class="isCollapsed ? 'w-4' : 'w-6'"></div>
            <div class="h-0.5 bg-gray-300 rounded w-6"></div>
            <div class="h-0.5 bg-gray-300 rounded transition-all duration-200" :class="isCollapsed ? 'w-4' : 'w-6'"></div>
          </div>
        </button>
        
        <button
          v-if="!isCollapsed"
          @click="emit('newChat')"
          class="p-2 hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 rounded-lg transition-all duration-200 hover:scale-105"
          title="New chat"
        >
          <PlusIcon class="w-5 h-5" />
        </button>
        
        <button
          v-else
          @click="emit('newChat')"
          class="p-2 hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 rounded-lg transition-all duration-200 hover:scale-105"
          title="New chat"
        >
          <PlusIcon class="w-5 h-5" />
        </button>
      </div>
      
      <h2 v-if="!isCollapsed" class="text-lg font-semibold text-gray-200 mt-3">Chat History</h2>
    </div>

    <!-- Chat List -->
    <div class="flex-1 overflow-y-auto scrollbar-thin p-2">
      <div v-if="chats.length === 0 && !isCollapsed" class="p-4 text-center text-gray-400 text-sm">
        No chats yet. Start a new conversation!
      </div>
      
      <div v-for="chat in chats" :key="chat.id" class="mb-2">
        <div
          class="group relative rounded-lg p-3 cursor-pointer transition-all duration-200 hover:bg-white/5"
          :class="{
            'bg-blue-600/20 border border-blue-500/30': currentChatId === chat.id,
            'hover:bg-white/10': currentChatId !== chat.id
          }"
          @click="emit('selectChat', chat.id)"
        >
          <!-- Collapsed view -->
          <div v-if="isCollapsed" class="flex items-center justify-center">
            <ChatIcon class="w-5 h-5 text-gray-300" />
          </div>
          
          <!-- Expanded view -->
          <div v-else class="flex items-start space-x-3">
            <ChatIcon class="w-5 h-5 text-gray-300 mt-0.5 flex-shrink-0" />
            
            <div class="flex-1 min-w-0">
              <!-- Title editing -->
              <div v-if="editingChatId === chat.id" class="mb-1">
                <input
                  ref="editInputRef"
                  v-model="editingTitle"
                  @keydown="handleKeydown"
                  @blur="saveEdit"
                  class="w-full bg-gray-800 text-gray-200 text-sm px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  maxlength="50"
                />
              </div>
              
              <!-- Normal title display -->
              <div v-else class="mb-1">
                <h3 class="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
                  {{ chat.title }}
                </h3>
              </div>
              
              <!-- Meta info -->
              <div class="flex items-center justify-between text-xs text-gray-400">
                <span>{{ chat.messageCount }} messages</span>
                <span>{{ formatDate(chat.updatedAt) }}</span>
              </div>
            </div>
          </div>

          <!-- Action buttons (only show when not collapsed and not editing) -->
          <div 
            v-if="!isCollapsed && editingChatId !== chat.id"
            class="absolute right-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-1"
          >
            <button
              @click.stop="startEditing(chat)"
              class="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
              title="Rename chat"
            >
              <EditIcon class="w-3 h-3" />
            </button>
            
            <button
              @click.stop="emit('deleteChat', chat.id)"
              class="p-1 hover:bg-red-600/20 rounded text-gray-400 hover:text-red-400 transition-colors"
              title="Delete chat"
            >
              <TrashIcon class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div v-if="!isCollapsed" class="p-4 border-t border-white/10">
      <div class="text-xs text-gray-400 text-center">
        {{ chats.length }} chat{{ chats.length !== 1 ? 's' : '' }} total
      </div>
    </div>
  </div>
</template>