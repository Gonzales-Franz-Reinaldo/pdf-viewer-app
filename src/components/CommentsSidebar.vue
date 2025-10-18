<template>
    <div class="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div class="p-4 border-b border-gray-200 bg-blue-600 text-white">
            <h2 class="text-lg font-semibold flex items-center gap-2">
                <MessageSquare :size="20" />
                Comentarios ({{ comments.length }})
            </h2>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-3">
            <div v-if="comments.length === 0" class="text-center text-gray-400 mt-8">
                <MessageSquare :size="48" class="mx-auto mb-2 opacity-50" />
                <p>No hay comentarios aún</p>
                <p class="text-sm mt-1">Selecciona texto en el PDF</p>
            </div>

            <div v-else v-for="comment in comments" :key="comment.id"
                class="bg-gray-50 rounded-lg p-3 border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
                @click="$emit('navigate', comment.pagina)">
                <div class="flex items-start justify-between mb-2">
                    <span class="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded">
                        Página {{ comment.pagina }}
                    </span>
                    <button @click.stop="$emit('delete', comment.id)" class="text-red-500 hover:text-red-700">
                        <X :size="16" />
                    </button>
                </div>

                <div class="bg-yellow-50 border-l-4 border-yellow-400 p-2 mb-2">
                    <p class="text-xs text-gray-700 italic line-clamp-2">
                        "{{ comment.texto }}"
                    </p>
                </div>

                <p class="text-sm text-gray-800 mb-2">{{ comment.comentario }}</p>

                <p class="text-xs text-gray-500">{{ comment.fecha }}</p>
            </div>
        </div>
    </div>
</template>

<script setup>
import { MessageSquare, X } from 'lucide-vue-next'

defineProps({
    comments: {
        type: Array,
        required: true
    }
})

defineEmits(['navigate', 'delete'])
</script>