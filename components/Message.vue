<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import hljs from 'highlight.js';
import BotIcon from './icons/BotIcon.vue';
import BrainIcon from './icons/BrainIcon.vue';
import UserIcon from './icons/UserIcon.vue';
import AlertIcon from './icons/AlertIcon.vue';
import RefreshIcon from './icons/RefreshIcon.vue';

const md = ref(null);

const props = defineProps({
  role: String,
  content: String,
  reasoning: String,
  answerIndex: Number,
  isError: Boolean,
  isRetryable: Boolean,
  errorType: String,
  errorDetails: Object,
});

const emit = defineEmits(['retry']);

const showThinking = ref(true);

// Function to process LaTeX in text
const processLatex = (text) => {
  let processedText = text;
  
  // Process display math \[...\]
  processedText = processedText.replace(/\\\[([\s\S]*?)\\\]/g, (match, latex) => {
    try {
      return katex.renderToString(latex, { displayMode: true });
    } catch (error) {
      console.warn('LaTeX rendering error:', error);
      return match; // Return original if rendering fails
    }
  });
  
  // Process display math ($$...$$)
  processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (match, latex) => {
    try {
      return katex.renderToString(latex, { displayMode: true });
    } catch (error) {
      console.warn('LaTeX rendering error:', error);
      return match; // Return original if rendering fails
    }
  });
  
  // Process inline math \(...\)
  processedText = processedText.replace(/\\\(([\s\S]*?)\\\)/g, (match, latex) => {
    try {
      return katex.renderToString(latex, { displayMode: false });
    } catch (error) {
      console.warn('LaTeX rendering error:', error);
      return match; // Return original if rendering fails
    }
  });
  
  // Process standalone LaTeX commands like \boxed{...}
  processedText = processedText.replace(/\\(boxed|text|textbf|textit|frac|sqrt|sum|int|lim|sin|cos|tan|log|ln|exp|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|phi|psi|omega)\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (match, command, content) => {
    try {
      return katex.renderToString(`\\${command}{${content}}`, { displayMode: false });
    } catch (error) {
      console.warn('LaTeX rendering error:', error);
      return match; // Return original if rendering fails
    }
  });
  
  // Process inline math ($...$)
  processedText = processedText.replace(/\$([^$\n]+?)\$/g, (match, latex) => {
    try {
      return katex.renderToString(latex, { displayMode: false });
    } catch (error) {
      console.warn('LaTeX rendering error:', error);
      return match; // Return original if rendering fails
    }
  });
  
  // Now escape remaining markdown special characters that aren't part of LaTeX
  processedText = processedText.replace(/\\([\[\]\(\)])/g, "\\\\$1");
  
  return processedText;
};

const thinking = computed(() => {
  if (!props.reasoning) return '';

  const processedText = processLatex(props.reasoning);

  return DOMPurify.sanitize(
    marked.parse(processedText, {
      async: false,
      breaks: true,
      highlight: (code, lang) => {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    }),
  );
});

const answer = computed(() => {
  // If no answerIndex is set, show the full content (for API providers)
  // If answerIndex is set, show content from that index onwards (for local models with thinking)
  const rawContent = props.answerIndex !== undefined ? props.content.slice(props.answerIndex) : props.content;
  const processedText = processLatex(rawContent);

  return DOMPurify.sanitize(
    marked.parse(processedText, {
      async: false,
      breaks: true,
      highlight: (code, lang) => {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    }),
  );
});

const doneThinking = computed(() => answer.value.length > 0);
const highlightCode = () => {
  nextTick(() => {
    if (md.value) {
      md.value.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  });
};

watch([thinking, answer], () => {
  highlightCode();
});
</script>

<template>
  <div class="flex items-start space-x-3 sm:space-x-4 group">
    <template v-if="role === 'assistant'">
      <div class="rounded-full p-2 shadow-lg" :class="isError ? 'bg-gradient-to-br from-red-500 to-red-600' : 'bg-gradient-to-br from-blue-500 to-purple-600'">
        <AlertIcon v-if="isError" class="h-5 w-5 text-white" />
        <BotIcon v-else class="h-5 w-5 text-white" />
      </div>

      <div ref="md" class="rounded-2xl p-4 sm:p-5 shadow-2xl w-full max-w-full sm:max-w-3xl transition-all duration-300" :class="isError ? 'bg-gradient-to-r from-red-900/20 to-red-800/20 border border-red-600/30' : 'glass-bubble'">
        <div class="min-h-6 overflow-wrap-anywhere" :class="isError ? 'text-red-200' : 'text-gray-200'">
          <template v-if="isError">
            <!-- Error Message Display -->
            <div class="space-y-3">
              <div class="flex items-start gap-3">
                <AlertIcon class="h-5 w-5 text-red-400 mt-1 flex-shrink-0" />
                <div class="flex-1">
                  <h3 class="font-medium text-red-300 mb-1">{{ errorType === 'rate_limit' ? 'Rate Limited' : 'API Error' }}</h3>
                  <p class="text-red-200">{{ content }}</p>
                  
                  <!-- Additional error details if available -->
                  <div v-if="errorDetails && errorDetails.metadata" class="mt-2 text-xs text-red-300/80">
                    <p v-if="errorDetails.metadata.provider_name">Provider: {{ errorDetails.metadata.provider_name }}</p>
                  </div>
                </div>
              </div>
              
              <!-- Retry Button -->
              <div v-if="isRetryable" class="flex justify-start">
                <button
                  @click="emit('retry')"
                  class="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 hover:border-red-500/60 rounded-lg transition-all duration-200 text-red-300 hover:text-red-200"
                >
                  <RefreshIcon class="h-4 w-4" />
                  <span>Retry</span>
                </button>
              </div>
            </div>
          </template>
          
          <template v-else>
            <!-- Normal Message Display -->
            <template v-if="thinking.length > 0">
              <div class="bg-gradient-to-r from-purple-900/20 to-blue-900/20 rounded-xl flex flex-col border border-purple-700/50">
                <button class="flex items-center gap-3 cursor-pointer p-4 hover:bg-gray-800/50 rounded-xl transition-all duration-200" @click="showThinking = !showThinking">
                  <BrainIcon :class="{ 'animate-pulse text-purple-500': !doneThinking, 'text-purple-400': doneThinking }" class="h-5 w-5" />
                  <span class="font-medium">{{ doneThinking ? 'View reasoning' : 'Thinking...' }}</span>
                  <span class="ml-auto text-gray-400 transition-transform duration-200" :class="{ 'rotate-180': showThinking }">▼</span>
                </button>

                <div v-if="showThinking" class="border-t border-purple-700/50 px-4 py-3">
                  <div class="markdown" v-html="thinking"></div>
                </div>
              </div>
            </template>
            <template v-if="answer.length > 0">
              <div v-if="doneThinking" :class="thinking.length > 0 ? 'mt-2' : ''">
                <div class="markdown" v-html="answer"></div>
              </div>
            </template>
            <template v-else>
              <span class="h-6 flex items-center gap-2">
                <span class="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse"></span>
                <span class="w-3 h-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-pulse animation-delay-200"></span>
                <span class="w-3 h-3 bg-gradient-to-r from-pink-500 to-blue-500 rounded-full animate-pulse animation-delay-400"></span>
              </span>
            </template>
          </template>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="bg-gradient-to-br from-green-500 to-blue-500 rounded-full p-2 shadow-lg">
        <UserIcon class="h-5 w-5 text-white" />
      </div>

      <div class="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl p-4 shadow-xl max-w-full sm:max-w-xl transition-all duration-300 border border-blue-400/20">
        <div class="min-h-6 overflow-wrap-anywhere">{{ content }}</div>
      </div>
    </template>
  </div>
</template>
