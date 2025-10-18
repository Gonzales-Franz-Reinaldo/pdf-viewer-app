<template>
    <div class="flex h-screen bg-gray-100">
        <!-- Panel lateral de comentarios -->
        <CommentsSidebar :comments="comments" @navigate="navigateToPage" @delete="deleteComment" />

        <!-- Área principal del PDF -->
        <div class="flex-1 flex flex-col">
            <!-- Barra superior -->
            <div class="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <FileText :size="24" class="text-blue-600" />
                    <h1 class="text-xl font-semibold text-gray-800">
                        {{ pdfFile ? pdfFile.name : 'Visor de PDF con Comentarios' }}
                    </h1>
                    <span v-if="numPages > 0" class="text-sm text-gray-500">
                        ({{ numPages }} páginas)
                    </span>
                </div>

                <div class="flex items-center gap-3">
                    <div v-if="numPages > 0" class="flex items-center gap-2 border border-gray-300 rounded-lg px-2">
                        <button @click="zoomOut" class="p-2 hover:bg-gray-100 rounded" title="Alejar">
                            <ZoomOut :size="18" />
                        </button>
                        <span class="text-sm font-medium min-w-[48px] text-center">
                            {{ Math.round(scale * 100) }}%
                        </span>
                        <button @click="zoomIn" class="p-2 hover:bg-gray-100 rounded" title="Acercar">
                            <ZoomIn :size="18" />
                        </button>
                    </div>

                    <button @click="triggerFileInput"
                        class="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                        <Upload :size="18" />
                        Cargar PDF
                    </button>
                </div>

                <input ref="fileInput" type="file" accept=".pdf" @change="handleFileUpload" class="hidden" />
            </div>

            <!-- Contenido del PDF -->
            <div ref="pdfContainer" class="flex-1 overflow-y-auto bg-gray-400 p-4">
                <div v-if="loading" class="flex flex-col items-center justify-center h-full text-gray-600">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                    <p class="text-lg">Cargando PDF...</p>
                </div>

                <div v-else-if="!loading && renderedPages.length === 0"
                    class="flex flex-col items-center justify-center h-full text-gray-500">
                    <Upload :size="64" class="mb-4 opacity-50" />
                    <p class="text-lg">Carga un documento PDF para comenzar</p>
                    <p class="text-sm mt-2">Haz clic en "Cargar PDF" en la esquina superior derecha</p>
                </div>

                <div v-else class="flex flex-col items-center gap-4">
                    <div v-for="pageNum in renderedPages" :key="pageNum" :id="`page-${pageNum}`"
                        :class="[
                            'relative bg-white shadow-2xl transition-all',
                            selectedComment === pageNum ? 'ring-4 ring-blue-400' : ''
                        ]"
                        @contextmenu="handleContextMenu($event, pageNum)">
                        <!-- Número de página -->
                        <div class="absolute -top-8 left-0 text-sm text-gray-600 font-medium">
                            Página {{ pageNum }} de {{ numPages }}
                        </div>

                        <!-- Canvas para renderizar PDF -->
                        <canvas :ref="el => setCanvasRef(pageNum, el)" class="block" />

                        <!-- Capa de texto transparente para selección -->
                        <div :id="`textLayer-${pageNum}`" class="absolute top-0 left-0 pdf-text-layer" />
                    </div>
                </div>
            </div>
        </div>

        <!-- Formulario flotante de comentario -->
        <CommentForm v-if="showCommentForm" :formData="commentFormData" @save="handleSaveComment"
            @close="showCommentForm = false" @update="updateFormData" />
    </div>
</template>

<script setup>
import { ref, shallowRef, watch, markRaw, nextTick, onBeforeUnmount } from 'vue'
import { FileText, Upload, ZoomIn, ZoomOut } from 'lucide-vue-next'
import * as pdfjsLib from 'pdfjs-dist'
import CommentsSidebar from './CommentsSidebar.vue'
import CommentForm from './CommentForm.vue'

// ✅ Configurar worker LOCAL
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

// Referencias
const fileInput = ref(null)
const pdfContainer = ref(null)
const canvasRefs = ref({})
const renderQueue = new Map()
const isRendering = ref(false) // ✅ NUEVO: Flag para evitar renderizados concurrentes

// ✅ Estado
const pdfFile = ref(null)
const pdfDoc = shallowRef(null)
const numPages = ref(0)
const renderedPages = ref([])
const comments = ref([])
const showCommentForm = ref(false)
const selectedText = ref('')
const selectedPage = ref(1)
const commentFormData = ref({
    texto: '',
    pagina: 1,
    comentario: ''
})
const selectedComment = ref(null)
const scale = ref(1.5)
const loading = ref(false)

let canvasObserver = null

// Métodos
const setCanvasRef = (pageNum, el) => {
    if (el) {
        canvasRefs.value[pageNum] = el
        if (pdfDoc.value && renderQueue.has(pageNum)) {
            renderPage(pdfDoc.value, pageNum, el)
            renderQueue.delete(pageNum)
        }
    }
}

const triggerFileInput = () => {
    fileInput.value?.click()
}

const zoomIn = () => {
    scale.value = Math.min(3, scale.value + 0.2)
}

const zoomOut = () => {
    scale.value = Math.max(0.5, scale.value - 0.2)
}

const renderPage = async (pdf, pageNum, canvas) => {
    if (!canvas) {
        console.warn(`Canvas ${pageNum} not available yet`)
        renderQueue.set(pageNum, true)
        return
    }

    try {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: scale.value })

        const context = canvas.getContext('2d')
        
        // ✅ IMPORTANTE: Limpiar canvas antes de renderizar
        canvas.height = viewport.height
        canvas.width = viewport.width
        context.clearRect(0, 0, canvas.width, canvas.height)

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        }

        await page.render(renderContext).promise

        // Crear capa de texto para selección
        const textLayer = document.getElementById(`textLayer-${pageNum}`)
        if (textLayer) {
            textLayer.innerHTML = ''
            textLayer.style.width = viewport.width + 'px'
            textLayer.style.height = viewport.height + 'px'

            const textContent = await page.getTextContent()
            const lines = {}

            textContent.items.forEach((item) => {
                const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
                const style = textContent.styles[item.fontName]

                const angle = Math.atan2(tx[1], tx[0])
                const fontHeight = Math.hypot(tx[2], tx[3])
                const fontAscent = style && style.ascent ? style.ascent : 0
                const top = Math.round(tx[5] - fontHeight * fontAscent)

                if (!lines[top]) {
                    lines[top] = []
                }

                lines[top].push({
                    str: item.str,
                    left: tx[4],
                    top: top,
                    fontSize: fontHeight,
                    fontFamily: item.fontName,
                    width: item.width * viewport.scale,
                    angle: angle
                })
            })

            Object.keys(lines).sort((a, b) => a - b).forEach(lineTop => {
                const lineDiv = document.createElement('div')
                lineDiv.style.position = 'absolute'
                lineDiv.style.left = '0'
                lineDiv.style.top = lineTop + 'px'
                lineDiv.style.height = (lines[lineTop][0].fontSize * 1.2) + 'px'
                lineDiv.style.whiteSpace = 'nowrap'
                lineDiv.style.userSelect = 'text'

                lines[lineTop].sort((a, b) => a.left - b.left)

                lines[lineTop].forEach(item => {
                    const span = document.createElement('span')
                    span.textContent = item.str
                    span.style.position = 'absolute'
                    span.style.left = item.left + 'px'
                    span.style.fontSize = item.fontSize + 'px'
                    span.style.fontFamily = item.fontFamily
                    span.style.color = 'transparent'
                    span.style.userSelect = 'text'
                    span.style.pointerEvents = 'auto'

                    if (item.angle !== 0) {
                        span.style.transform = `rotate(${item.angle}rad)`
                    }

                    lineDiv.appendChild(span)
                })

                textLayer.appendChild(lineDiv)
            })
        }

        console.log(`✅ Página ${pageNum} renderizada correctamente (escala: ${scale.value})`)
    } catch (error) {
        console.error(`Error rendering page ${pageNum}:`, error)
    }
}

// ✅ NUEVO: Función para renderizar todas las páginas
const renderAllPages = async () => {
    if (!pdfDoc.value || renderedPages.value.length === 0 || isRendering.value) {
        return
    }

    isRendering.value = true
    loading.value = true

    try {
        console.log(`🔄 Re-renderizando ${renderedPages.value.length} páginas con escala ${scale.value}...`)
        
        await nextTick()
        await nextTick()

        for (const pageNum of renderedPages.value) {
            const canvas = canvasRefs.value[pageNum]
            if (canvas) {
                await renderPage(pdfDoc.value, pageNum, canvas)
            } else {
                console.warn(`⚠️ Canvas ${pageNum} no disponible para re-renderizado`)
            }
        }

        console.log('✅ Re-renderizado completado')
    } catch (error) {
        console.error('❌ Error en re-renderizado:', error)
    } finally {
        isRendering.value = false
        loading.value = false
    }
}

const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (file && file.type === 'application/pdf') {
        loading.value = true
        pdfFile.value = file

        // ✅ Limpiar estado previo
        renderedPages.value = []
        canvasRefs.value = {}
        numPages.value = 0
        renderQueue.clear()

        try {
            const arrayBuffer = await file.arrayBuffer()
            const typedArray = new Uint8Array(arrayBuffer)

            const loadingTask = pdfjsLib.getDocument(typedArray)
            const pdf = markRaw(await loadingTask.promise)

            pdfDoc.value = pdf
            numPages.value = pdf.numPages

            // ✅ Crear array de páginas
            const pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1)
            renderedPages.value = pages

            // ✅ Esperar múltiples ciclos de Vue
            await nextTick()
            await nextTick()
            
            // ✅ Esperar un poco más para asegurar que el DOM esté completamente listo
            await new Promise(resolve => setTimeout(resolve, 200))
            
            // ✅ Renderizar todas las páginas que tengan canvas disponible
            for (let i = 1; i <= pdf.numPages; i++) {
                const canvas = canvasRefs.value[i]
                if (canvas) {
                    await renderPage(pdf, i, canvas)
                } else {
                    renderQueue.set(i, true)
                }
            }
            
            // ✅ Intentar renderizar páginas pendientes después de otro delay
            if (renderQueue.size > 0) {
                await new Promise(resolve => setTimeout(resolve, 300))
                
                for (const [pageNum] of renderQueue) {
                    const canvas = canvasRefs.value[pageNum]
                    if (canvas) {
                        await renderPage(pdf, pageNum, canvas)
                        renderQueue.delete(pageNum)
                    }
                }
            }
            
            loading.value = false
        } catch (error) {
            console.error('Error loading PDF:', error)
            loading.value = false
            alert('Error al cargar el PDF. Por favor, intenta con otro archivo.')
        }
    }
}

const handleContextMenu = (e, pageNumber) => {
    e.preventDefault()
    const selection = window.getSelection()
    const text = selection.toString().trim()

    if (text.length > 0) {
        selectedText.value = text
        selectedPage.value = pageNumber
        commentFormData.value = {
            texto: text,
            pagina: pageNumber,
            comentario: ''
        }
        showCommentForm.value = true
    }
}

const updateFormData = (data) => {
    commentFormData.value = { ...commentFormData.value, ...data }
}

const handleSaveComment = () => {
    if (commentFormData.value.comentario.trim()) {
        const newComment = {
            id: Date.now(),
            texto: commentFormData.value.texto,
            pagina: commentFormData.value.pagina,
            comentario: commentFormData.value.comentario,
            fecha: new Date().toLocaleString()
        }
        comments.value = [...comments.value, newComment]
        showCommentForm.value = false
        commentFormData.value = { texto: '', pagina: 1, comentario: '' }
    }
}

const navigateToPage = (pageNumber) => {
    const pageElement = document.getElementById(`page-${pageNumber}`)
    if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
        selectedComment.value = pageNumber
        setTimeout(() => {
            selectedComment.value = null
        }, 2000)
    }
}

const deleteComment = (id) => {
    comments.value = comments.value.filter(c => c.id !== id)
}

// ✅ MEJORADO: Observar cambios en el zoom con debounce optimizado
let zoomTimeout = null
watch(scale, (newScale, oldScale) => {
    if (!pdfDoc.value || renderedPages.value.length === 0) return
    
    console.log(`🔍 Zoom cambiado: ${oldScale.toFixed(2)} → ${newScale.toFixed(2)}`)
    
    // ✅ Cancelar timeout anterior
    if (zoomTimeout) {
        clearTimeout(zoomTimeout)
    }
    
    // ✅ Esperar 400ms antes de re-renderizar (debounce)
    zoomTimeout = setTimeout(() => {
        renderAllPages()
    }, 400)
})

// ✅ Limpiar al desmontar
onBeforeUnmount(() => {
    if (canvasObserver) {
        canvasObserver.disconnect()
    }
    if (zoomTimeout) {
        clearTimeout(zoomTimeout)
    }
})
</script>


<style scoped>
/* Estilos para la capa de texto del PDF */
.pdf-text-layer {
    width: 100%;
    height: 100%;
    overflow: visible;
    cursor: text;
    user-select: text;
    pointer-events: auto;
}

.pdf-text-layer :deep(div)::selection,
.pdf-text-layer :deep(span)::selection {
    background: rgba(0, 123, 255, 0.3);
    color: transparent;
}

.pdf-text-layer :deep(div) {
    line-height: 1;
    cursor: text;
}

.pdf-text-layer :deep(span) {
    white-space: pre;
    cursor: text;
    -webkit-user-select: text;
    -moz-user-select: text;
    -ms-user-select: text;
    user-select: text;
}

.pdf-text-layer:hover {
    cursor: text;
}
</style>