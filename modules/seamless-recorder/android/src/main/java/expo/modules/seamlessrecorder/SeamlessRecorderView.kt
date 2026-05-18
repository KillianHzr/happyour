package expo.modules.seamlessrecorder

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.util.Consumer
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.views.ExpoView
import java.io.File

class SeamlessRecorderView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

  private val previewView = PreviewView(context)
  private val mainHandler = Handler(Looper.getMainLooper())

  private var cameraProvider: ProcessCameraProvider? = null
  private var camera: androidx.camera.core.Camera? = null
  private var videoCapture: VideoCapture<Recorder>? = null
  private var activeRecording: Recording? = null

  private var pendingZoom: Float? = null
  private var pendingTorch: Boolean? = null

  private var facingFront = false
  private var pendingFacing: Boolean? = null

  // Clip URIs accumulated across camera switches for this recording session
  private val clipUris = mutableListOf<String>()
  private var isSessionActive = false

  // What to do once the current clip finalises
  private sealed class PendingAction {
    object Switch : PendingAction()
    class Stop(val promise: Promise) : PendingAction()
  }
  private var pendingAction: PendingAction? = null

  init {
    addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    setupCamera()
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  fun setFacing(facing: String) {
    val wantFront = (facing == "front")
    if (cameraProvider == null) { pendingFacing = wantFront; return }
    if (wantFront == facingFront) return
    // During an active session switchCamera() owns the camera switch — ignore prop changes.
    if (isSessionActive) return
    facingFront = wantFront
    mainHandler.post { bindCamera() }
  }

  fun startRecording() {
    mainHandler.post {
      clipUris.clear()
      isSessionActive = true
      beginClip()
    }
  }

  fun stopRecording(promise: Promise) {
    mainHandler.post {
      if (!isSessionActive) {
        promise.reject("STOP_ERROR", "Not recording", null)
        return@post
      }
      isSessionActive = false
      if (activeRecording == null) {
        promise.reject("STOP_ERROR", "No active clip", null)
        return@post
      }
      pendingAction = PendingAction.Stop(promise)
      activeRecording?.stop()
    }
  }

  fun setZoom(zoom: Double) {
    mainHandler.post {
      val z = zoom.toFloat().coerceIn(0f, 1f)
      val c = camera
      if (c != null) c.cameraControl.setLinearZoom(z) else pendingZoom = z
    }
  }

  fun setTorch(on: Boolean) {
    mainHandler.post {
      val c = camera
      if (c != null) c.cameraControl.enableTorch(on) else pendingTorch = on
    }
  }

  fun switchCamera() {
    mainHandler.post {
      if (!isSessionActive) return@post
      if (activeRecording == null) {
        facingFront = !facingFront
        bindCamera()
        beginClip()
        return@post
      }
      // Stop current clip; the Finalize event will switch the camera and start a new clip.
      pendingAction = PendingAction.Switch
      activeRecording?.stop()
    }
  }

  // ── Camera setup ─────────────────────────────────────────────────────────────

  private fun setupCamera() {
    ProcessCameraProvider.getInstance(context).addListener({
      cameraProvider = ProcessCameraProvider.getInstance(context).get()
      pendingFacing?.let { facingFront = it; pendingFacing = null }
      bindCamera()
    }, ContextCompat.getMainExecutor(context))
  }

  private fun bindCamera() {
    val provider = cameraProvider ?: return
    val lifecycle = findLifecycleOwner() ?: return
    val selector = if (facingFront) CameraSelector.DEFAULT_FRONT_CAMERA
                   else CameraSelector.DEFAULT_BACK_CAMERA
    val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
    val recorder = Recorder.Builder().setQualitySelector(QualitySelector.from(Quality.HD)).build()
    val vc = VideoCapture.withOutput(recorder).also { videoCapture = it }
    try {
      provider.unbindAll()
      camera = provider.bindToLifecycle(lifecycle, selector, preview, vc)
      pendingZoom?.let { camera?.cameraControl?.setLinearZoom(it); pendingZoom = null }
      pendingTorch?.let { camera?.cameraControl?.enableTorch(it); pendingTorch = null }
    } catch (e: Exception) {
      Log.e("SeamlessRecorder", "bindCamera failed: ${e.message}")
    }
  }

  // ── Recording ────────────────────────────────────────────────────────────────

  private fun beginClip() {
    val vc = videoCapture ?: return
    val file = File(context.cacheDir, "clip_${System.currentTimeMillis()}.mp4")
    activeRecording = vc.output
      .prepareRecording(context, FileOutputOptions.Builder(file).build())
      .withAudioEnabled()
      .start(ContextCompat.getMainExecutor(context), buildEventListener(file))
  }

  private fun buildEventListener(file: File): Consumer<VideoRecordEvent> =
    Consumer { event ->
      if (event !is VideoRecordEvent.Finalize) return@Consumer

      activeRecording = null
      if (!event.hasError()) {
        clipUris.add("file://${file.absolutePath}")
      } else {
        Log.e("SeamlessRecorder", "Clip error: ${event.cause?.message}")
      }

      when (val action = pendingAction) {
        is PendingAction.Switch -> {
          pendingAction = null
          facingFront = !facingFront
          bindCamera()
          if (isSessionActive) beginClip()
        }
        is PendingAction.Stop -> {
          pendingAction = null
          if (clipUris.isEmpty()) {
            action.promise.reject("STOP_ERROR", "Recording produced no usable clips", null)
          } else {
            action.promise.resolve(clipUris.toList())
          }
        }
        null -> {}
      }
    }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private fun findLifecycleOwner(): LifecycleOwner? {
    var ctx: Context? = context
    while (ctx != null) {
      if (ctx is LifecycleOwner) return ctx
      ctx = if (ctx is android.content.ContextWrapper) ctx.baseContext else null
    }
    return null
  }
}
