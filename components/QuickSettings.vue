<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  currentSettings: Object,
  currentSystemPromptId: String,
  getAllSystemPrompts: Array,
  getCurrentSystemPrompt: Object,
  setSystemPrompt: Function,
  loadModel: Function
});

const emit = defineEmits(['settingsChanged']);

const showDropdown = ref(false);
const activeMenu = ref(null); // 'models' or 'prompts'
const flyoutDirection = ref('right'); // 'left' or 'right'

const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value;
  if (!showDropdown.value) {
    activeMenu.value = null;
  }
};

const showMenu = (menu) => {
  activeMenu.value = menu;
  
  // Check screen width to determine flyout direction
  const screenWidth = window.innerWidth;
  const buttonRect = document.querySelector('.quick-settings-container')?.getBoundingClientRect();
  
  if (buttonRect && buttonRect.right + 250 > screenWidth) {
    flyoutDirection.value = 'left';
  } else {
    flyoutDirection.value = 'right';
  }
};

const hideMenu = () => {
  activeMenu.value = null;
};

const selectModel = (apiIndex) => {
  const newSettings = { ...props.currentSettings };
  newSettings.selectedCustomApi = apiIndex;
  newSettings.provider = 'custom';
  emit('settingsChanged', newSettings);
  showDropdown.value = false;
  activeMenu.value = null;
};

const selectLocalModel = () => {
  const newSettings = { ...props.currentSettings };
  newSettings.provider = 'local';
  emit('settingsChanged', newSettings);
  showDropdown.value = false;
  activeMenu.value = null;
};

const selectSystemPrompt = (promptId) => {
  props.setSystemPrompt(promptId);
  props.loadModel();
  showDropdown.value = false;
  activeMenu.value = null;
};

const getCurrentModelName = computed(() => {
  if (props.currentSettings.provider === 'local') {
    return 'Qwen3 4B (Local)';
  } else if (props.currentSettings.provider === 'custom' && props.currentSettings.selectedCustomApi !== null) {
    const api = props.currentSettings.customApis[props.currentSettings.selectedCustomApi];
    return api ? api.name : 'Custom API';
  }
  return 'No Model';
});

const getProviderById = (id) => {
  return props.currentSettings.providers?.find(p => p.id === id);
};

// Computed properties for alphabetically sorted lists
const sortedCustomApis = computed(() => {
  if (!props.currentSettings.customApis) return [];
  return [...props.currentSettings.customApis].sort((a, b) => 
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
});

const sortedSystemPrompts = computed(() => {
  if (!props.getAllSystemPrompts) return [];
  return [...props.getAllSystemPrompts].sort((a, b) => 
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
});

// Close dropdown when clicking outside
const handleClickOutside = (event) => {
  if (!event.target.closest('.quick-settings-container')) {
    showDropdown.value = false;
    activeMenu.value = null;
  }
};

// Add event listener when component mounts
import { onMounted, onUnmounted } from 'vue';

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="quick-settings-container relative">
    <!-- Settings Button -->
    <button
      @click="toggleDropdown"
      class="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
      title="Quick Settings"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
      </svg>
    </button>

    <!-- Dropdown Menu -->
    <div
      v-if="showDropdown"
      class="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl min-w-[200px] z-[60]"
    >
      <!-- Model Selection -->
      <div class="relative">
        <button
          @mouseenter="showMenu('models')"
          class="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center justify-between border-b border-gray-700"
        >
          <div>
            <div class="font-medium">Model</div>
            <div class="text-xs text-gray-400 truncate">{{ getCurrentModelName }}</div>
          </div>
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </button>

        <!-- Models Flyout -->
        <div
          v-if="activeMenu === 'models'"
          @mouseenter="showMenu('models')"
          @mouseleave="hideMenu"
          :class="[
            'absolute top-0 bg-gray-800 border border-gray-600 rounded-lg shadow-xl min-w-[250px] max-h-[300px] overflow-y-auto z-[70]',
            flyoutDirection === 'right' ? 'left-full ml-1' : 'right-full mr-1'
          ]"
          style="transform: translateY(-50%); top: 50%;"
        >
          <!-- Local Model -->
          <button
            @click="selectLocalModel"
            class="w-full px-4 py-3 text-left text-sm hover:bg-gray-700 border-b border-gray-700"
            :class="currentSettings.provider === 'local' ? 'bg-blue-600/20 text-blue-200' : 'text-gray-200'"
          >
            <div class="font-medium">Qwen3 4B (Local)</div>
            <div class="text-xs text-gray-400">Runs in browser using WebGPU</div>
          </button>

          <!-- Custom APIs -->
          <div v-if="currentSettings.customApis && currentSettings.customApis.length > 0">
            <div class="px-4 py-2 text-xs font-medium text-gray-400 bg-gray-900">Custom APIs</div>
            <button
              v-for="api in sortedCustomApis"
              :key="api.name"
              @click="selectModel(currentSettings.customApis.findIndex(a => a === api))"
              class="w-full px-4 py-3 text-left text-sm hover:bg-gray-700"
              :class="currentSettings.provider === 'custom' && currentSettings.selectedCustomApi === currentSettings.customApis.findIndex(a => a === api) ? 'bg-blue-600/20 text-blue-200' : 'text-gray-200'"
            >
              <div class="font-medium">{{ api.name }}</div>
              <div class="text-xs text-gray-400">
                Provider: {{ getProviderById(api.providerId)?.name || 'Unknown' }}
              </div>
            </button>
          </div>

          <!-- No Custom APIs Message -->
          <div v-else class="px-4 py-3 text-sm text-gray-400 text-center">
            No custom APIs configured
          </div>
        </div>
      </div>

      <!-- System Prompt Selection -->
      <div class="relative">
        <button
          @mouseenter="showMenu('prompts')"
          class="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center justify-between"
        >
          <div>
            <div class="font-medium">System Prompt</div>
            <div class="text-xs text-gray-400 truncate">{{ getCurrentSystemPrompt?.name || 'No prompt' }}</div>
          </div>
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </button>

        <!-- System Prompts Flyout -->
        <div
          v-if="activeMenu === 'prompts'"
          @mouseenter="showMenu('prompts')"
          @mouseleave="hideMenu"
          :class="[
            'absolute top-0 bg-gray-800 border border-gray-600 rounded-lg shadow-xl min-w-[250px] max-h-[300px] overflow-y-auto z-[100]',
            flyoutDirection === 'right' ? 'left-full ml-1' : 'right-full mr-1'
          ]"
          style="transform: translateY(-50%); top: 50%;"
        >
          <button
            v-for="prompt in sortedSystemPrompts"
            :key="prompt.id"
            @click="selectSystemPrompt(prompt.id)"
            class="w-full px-4 py-3 text-left text-sm hover:bg-gray-700 border-b border-gray-700 last:border-b-0"
            :class="currentSystemPromptId === prompt.id ? 'bg-blue-600/20 text-blue-200' : 'text-gray-200'"
          >
            <div class="font-medium">{{ prompt.name }}{{ prompt.isBuiltIn ? ' (Built-in)' : '' }}</div>
            <div v-if="prompt.description" class="text-xs text-gray-400 truncate">{{ prompt.description }}</div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>