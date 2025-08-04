<script setup>
const props = defineProps({
  text: String,
  percentage: {
    type: Number,
    default: 0,
  },
  total: Number,
});

const formatBytes = (size) => {
  const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
  return (
    +(size / Math.pow(1024, i)).toFixed(2) +
    ['B', 'kB', 'MB', 'GB', 'TB'][i]
  );
};
</script>

<template>
  <div class="w-full bg-gray-800/50 text-left rounded-xl overflow-hidden mb-3 shadow-inner border border-gray-700/30">
    <div 
      class="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 whitespace-nowrap px-4 py-3 text-sm text-white font-medium transition-all duration-500 ease-out relative overflow-hidden"
      :style="{ width: `${Math.max(percentage, 12)}%` }"
    >
      <div class="relative z-10">
        {{ text }} ({{ percentage.toFixed(1) }}%{{ isNaN(total) ? '' : ` of ${formatBytes(total)}` }})
      </div>
      <div class="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent animate-pulse"></div>
      <div class="absolute top-0 right-0 w-2 h-full bg-white/40 animate-bounce"></div>
    </div>
  </div>
</template>
