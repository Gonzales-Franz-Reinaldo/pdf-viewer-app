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
                        <button @click="zoomOut" class="p-2 hover:bg-gray-100 rounded" title="Alejar" :disabled="loading">
                            <ZoomOut :size="18" />
                        </button>
                        <span class="text-sm font-medium min-w-[48px] text-center">
                            {{ Math.round(scale * 100) }}%
                        </span>
                        <button @click="zoomIn" class="p-2 hover:bg-gray-100 rounded" title="Acercar" :disabled="loading">
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
            <div ref="pdfContainer" class="flex-1 overflow-y-auto bg-gray-400 p-4 relative">
                <!-- Overlay de carga para zoom -->
                <div v-if="loading" class="absolute inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50">
                    <div class="bg-white rounded-lg p-6 flex flex-col items-center shadow-xl">
                        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                        <p class="text-lg text-gray-800">{{ loadingMessage }}</p>
                    </div>
                </div>

                <div v-if="!pdfDoc && renderedPages.length === 0"
                    class="flex flex-col items-center justify-center h-full text-gray-500">
                    <Upload :size="64" class="mb-4 opacity-50" />
                    <p class="text-lg">Carga un documento PDF para comenzar</p>
                    <p class="text-sm mt-2">Haz clic en "Cargar PDF" en la esquina superior derecha</p>
                </div>

                <div v-else class="flex flex-col items-center gap-4">
                    <div v-for="pageNum in renderedPages" :key="`page-${pageNum}`" 
                        :id="`page-${pageNum}`"
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
                        <canvas :ref="el => setCanvasRef(pageNum, el)" 
                                :data-page="pageNum"
                                class="block" />

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

//  Configurar worker LOCAL
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

// Referencias
const fileInput = ref(null)
const pdfContainer = ref(null)
const canvasRefs = ref({})

// Estado
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
const loadingMessage = ref('Cargando PDF...')

// Métodos
const setCanvasRef = (pageNum, el) => {
    if (el) {
        canvasRefs.value[pageNum] = el
    }
}

const triggerFileInput = () => {
    fileInput.value?.click()
}

const zoomIn = () => {
    if (!loading.value) {
        scale.value = Math.min(3, scale.value + 0.2)
    }
}

const zoomOut = () => {
    if (!loading.value) {
        scale.value = Math.max(0.5, scale.value - 0.2)
    }
}

const renderPage = async (pdf, pageNum, canvas) => {
    if (!canvas || !pdf) {
        console.warn(`Canvas o PDF no disponible para página ${pageNum}`)
        return
    }

    try {
        // Cancelar renderizado previo si existe
        if (canvas._renderTask) {
            try {
                canvas._renderTask.cancel()
            } catch (e) {
                // Ignorar errores de cancelación
            }
        }

        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: scale.value })
        const context = canvas.getContext('2d', { alpha: false })
        
        // Calcular escala para pantallas de alta resolución
        const outputScale = window.devicePixelRatio || 1
        
        // Establecer dimensiones del canvas
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = Math.floor(viewport.width) + 'px'
        canvas.style.height = Math.floor(viewport.height) + 'px'
        
        // Aplicar transformación para alta resolución
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
        
        // Fondo blanco
        context.fillStyle = 'white'
        context.fillRect(0, 0, viewport.width, viewport.height)

        // Renderizar página
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        }

        canvas._renderTask = page.render(renderContext)
        await canvas._renderTask.promise
        canvas._renderTask = null

        //  Actualizar capa de texto en paralelo (no-blocking)
        updateTextLayer(page, viewport, pageNum)

        console.log(` Página ${pageNum} renderizada`)
    } catch (error) {
        if (error.name !== 'RenderingCancelledException') {
            console.error(` Error renderizando página ${pageNum}:`, error)
        }
    }
}

const updateTextLayer = async (page, viewport, pageNum) => {
    const textLayer = document.getElementById(`textLayer-${pageNum}`)
    if (!textLayer) return

    textLayer.innerHTML = ''
    textLayer.style.width = viewport.width + 'px'
    textLayer.style.height = viewport.height + 'px'

    try {
        const textContent = await page.getTextContent()
        const lines = {}

        // Agrupar texto por líneas
        textContent.items.forEach((item) => {
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
            const style = textContent.styles[item.fontName]
            const angle = Math.atan2(tx[1], tx[0])
            const fontHeight = Math.hypot(tx[2], tx[3])
            const fontAscent = style && style.ascent ? style.ascent : 0
            const top = Math.round(tx[5] - fontHeight * fontAscent)

            if (!lines[top]) lines[top] = []

            lines[top].push({
                str: item.str,
                left: tx[4],
                top: top,
                fontSize: fontHeight,
                fontFamily: item.fontName,
                angle: angle
            })
        })

        //  Usar DocumentFragment para mejor rendimiento
        const fragment = document.createDocumentFragment()

        Object.keys(lines).sort((a, b) => a - b).forEach(lineTop => {
            const lineDiv = document.createElement('div')
            lineDiv.style.cssText = `position:absolute;left:0;top:${lineTop}px;height:${lines[lineTop][0].fontSize * 1.2}px;white-space:nowrap;user-select:text`

            lines[lineTop].sort((a, b) => a.left - b.left)

            lines[lineTop].forEach(item => {
                const span = document.createElement('span')
                span.textContent = item.str
                const transform = item.angle !== 0 ? `rotate(${item.angle}rad)` : ''
                span.style.cssText = `position:absolute;left:${item.left}px;font-size:${item.fontSize}px;font-family:${item.fontFamily};color:transparent;user-select:text;pointer-events:auto;${transform ? `transform:${transform}` : ''}`
                lineDiv.appendChild(span)
            })

            fragment.appendChild(lineDiv)
        })

        textLayer.appendChild(fragment)
    } catch (error) {
        console.error(`Error creando capa de texto para página ${pageNum}:`, error)
    }
}

const renderAllPages = async () => {
    if (!pdfDoc.value || renderedPages.value.length === 0) {
        return
    }

    loadingMessage.value = `Ajustando zoom a ${Math.round(scale.value * 100)}%...`

    try {
        console.log(` Renderizando ${renderedPages.value.length} páginas con escala ${scale.value}`)
        
        // Esperar a que el DOM se actualice
        await nextTick()

        //  RENDERIZADO EN PARALELO - Todas las páginas a la vez
        const renderPromises = renderedPages.value.map(pageNum => {
            const canvas = canvasRefs.value[pageNum]
            if (canvas) {
                return renderPage(pdfDoc.value, pageNum, canvas)
            }
            return Promise.resolve()
        })

        // Esperar a que TODAS las páginas se rendericen en paralelo
        await Promise.all(renderPromises)

        console.log(' Todas las páginas renderizadas')
    } catch (error) {
        console.error(' Error en renderizado:', error)
    }
}

const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || file.type !== 'application/pdf') return

    loading.value = true
    loadingMessage.value = 'Cargando PDF...'
    pdfFile.value = file

    // Limpiar estado previo
    renderedPages.value = []
    canvasRefs.value = {}
    numPages.value = 0
    comments.value = []

    try {
        const arrayBuffer = await file.arrayBuffer()
        const typedArray = new Uint8Array(arrayBuffer)
        const loadingTask = pdfjsLib.getDocument(typedArray)
        const pdf = markRaw(await loadingTask.promise)

        pdfDoc.value = pdf
        numPages.value = pdf.numPages

        loadingMessage.value = 'Preparando páginas...'

        // Crear array de páginas
        renderedPages.value = Array.from({ length: pdf.numPages }, (_, i) => i + 1)

        // Esperar a que Vue cree los elementos DOM
        await nextTick()
        await nextTick()
        
        loadingMessage.value = 'Renderizando páginas...'

        //  RENDERIZADO EN PARALELO - Todas las páginas a la vez
        const renderPromises = []
        for (let i = 1; i <= pdf.numPages; i++) {
            const canvas = canvasRefs.value[i]
            if (canvas) {
                renderPromises.push(renderPage(pdf, i, canvas))
            }
        }

        // Esperar a que TODAS las páginas se rendericen simultáneamente
        await Promise.all(renderPromises)
        
        loading.value = false
        console.log(' PDF cargado completamente')
    } catch (error) {
        console.error(' Error cargando PDF:', error)
        loading.value = false
        alert('Error al cargar el PDF. Por favor, intenta con otro archivo.')
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

// Watch para cambios en el zoom
let zoomTimeout = null
watch(scale, () => {
    if (!pdfDoc.value || renderedPages.value.length === 0) return
    
    console.log(` Zoom cambiado a ${Math.round(scale.value * 100)}%`)
    
    // Cancelar timeout previo
    if (zoomTimeout) {
        clearTimeout(zoomTimeout)
    }
    
    // Mostrar loading
    loading.value = true
    
    //  Reducido a 150ms para respuesta más rápida
    zoomTimeout = setTimeout(async () => {
        await renderAllPages()
        loading.value = false
    }, 150)
})

// Cleanup
onBeforeUnmount(() => {
    if (zoomTimeout) {
        clearTimeout(zoomTimeout)
    }
    
    // Cancelar todos los renderizados pendientes
    Object.values(canvasRefs.value).forEach(canvas => {
        if (canvas && canvas._renderTask) {
            try {
                canvas._renderTask.cancel()
            } catch (e) {
                // Ignorar errores
            }
        }
    })
})
</script>

<style scoped>
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

canvas {
    display: block;
}
</style>