<script setup>
import { ref, computed, nextTick } from 'vue';
import Message from './Message.vue';

const props = defineProps({
  messages: Array,
  lastAiMessageIndex: Number
});

const emit = defineEmits(['retry']);

const empty = computed(() => props.messages.length === 0);

// Refs for messages
const messageRefs = ref([]);

// Function to set message refs
const setMessageRef = (el, index) => {
  if (el) {
    messageRefs.value[index] = el;
  }
};

// Expose message refs
defineExpose({
  messageRefs
});
</script>

<template>
  <div class="flex-1 p-4 sm:p-6 max-w-[960px] w-full" :class="{ 'flex flex-col items-center justify-end': empty, 'space-y-4': !empty }">
    <template v-if="empty">
      <div class="text-center mb-8 relative">
        <div class="text-6xl mb-6 float hover:scale-110 transition-transform duration-300">🤖</div>
        <div class="text-xl sm:text-2xl font-bold gradient-text mb-2">AI Chat Ready!</div>
        <div class="text-sm sm:text-base text-gray-400 mt-2 px-4 opacity-80">Choose an example below or type your own message</div>
        
        <!-- Floating decorative elements -->
        <div class="absolute -top-8 -left-8 w-16 h-16 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-xl animate-pulse"></div>
        <div class="absolute -bottom-4 -right-6 w-12 h-12 bg-gradient-to-r from-pink-500/20 to-blue-500/20 rounded-full blur-lg animate-pulse animation-delay-200"></div>
      </div>
    </template>
    <template v-else>
      <Message 
        v-for="(msg, i) in messages" 
        :key="`message-${i}`" 
        :ref="(el) => setMessageRef(el, i)"
        :role="msg.role" 
        :content="msg.content" 
        :reasoning="msg.reasoning"
        :answerIndex="msg.answerIndex"
        :isError="msg.isError"
        :isRetryable="msg.isRetryable"
        :errorType="msg.errorType"
        :errorDetails="msg.errorDetails"
        :isLastAiMessage="i === lastAiMessageIndex"
        @retry="emit('retry')"
      />
    </template>
  </div>
</template>
