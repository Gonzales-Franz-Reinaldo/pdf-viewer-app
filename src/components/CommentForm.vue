<template>
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-800">Agregar Comentario</h3>
                <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600">
                    <X :size="20" />
                </button>
            </div>

            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Texto Seleccionado
                    </label>
                    <div
                        class="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-gray-700 italic max-h-32 overflow-y-auto">
                        "{{ formData.texto }}"
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Página
                    </label>
                    <input type="text" :value="`Página ${formData.pagina}`" disabled
                        class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600" />
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Comentario *
                    </label>
                    <textarea :value="formData.comentario" @input="updateComentario"
                        placeholder="Escribe tu comentario aquí..." rows="4"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>

                <div class="flex gap-3 pt-2">
                    <button @click="$emit('close')"
                        class="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors">
                        Cancelar
                    </button>
                    <button @click="$emit('save')"
                        class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { X } from 'lucide-vue-next'

const props = defineProps({
    formData: {
        type: Object,
        required: true
    }
})

const emit = defineEmits(['close', 'save', 'update'])

const updateComentario = (e) => {
    emit('update', {
        ...props.formData,
        comentario: e.target.value
    })
}
</script>