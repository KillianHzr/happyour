package expo.modules.seamlessrecorder

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
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
import androidx.lifecycle.ProcessLifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.views.ExpoView
import java.io.File

class SeamlessRecorderView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

  private val previewView = PreviewView(context).apply {
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
  }
  private val mainHandler = Handler(Looper.getMainLooper())

  private var cameraProvider: ProcessCameraProvider? = null
  private var camera: androidx.camera.core.Camera? = null
  private var videoCapture: VideoCapture<Recorder>? = null
  private var imageCapture: ImageCapture? = null
  private var activeRecording: Recording? = null

  private var pendingZoom: Float? = null
  private var pendingTorch: Boolean? = null
  private var flashMode = ImageCapture.FLASH_MODE_OFF
  private var isVideoMode = false

  private var isViewAttached = false
  private var facingFront = false
  private var pendingFacing: Boolean? = null

  // Clip URIs accumulated across camera switches for this recording session
  private val clipUris = mutableListOf<String>()
  private var isSessionActive = false

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
    isViewAttached = true
    setupCamera()
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    isViewAttached = false
    mainHandler.post {
      try { cameraProvider?.unbindAll() } catch (_: Exception) {}
      camera = null
      videoCapture = null
      imageCapture = null
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  fun setFacing(facing: String) {
    val wantFront = (facing == "front")
    if (cameraProvider == null) { pendingFacing = wantFront; return }
    if (wantFront == facingFront) return
    if (isSessionActive) return
    facingFront = wantFront
    mainHandler.post { bindCamera() }
  }

  fun setVideoMode(video: Boolean) {
    if (isVideoMode == video) return
    isVideoMode = video
    mainHandler.post {
      if (!isViewAttached || cameraProvider == null) return@post
      // Full rebind instead of partial — partial rebind causes a double-reset race on CameraX's
      // internal camera thread (unbind fires async reset, then bindToLifecycle fires while that
      // reset is still in progress), leaving the capture session in a cancelled/timeout state
      // that makes the Recorder fail with ERROR_RECORDER_ERROR code=8 (null cause).
      bindCamera()
    }
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
    val z = zoom.toFloat().coerceIn(0f, 1f)
    val c = camera
    if (c != null) c.cameraControl.setLinearZoom(z) else pendingZoom = z
  }

  fun setTorch(on: Boolean) {
    mainHandler.post {
      val c = camera
      if (c != null) c.cameraControl.enableTorch(on) else pendingTorch = on
    }
  }

  fun setFlash(mode: String) {
    flashMode = when (mode) {
      "on" -> ImageCapture.FLASH_MODE_ON
      "auto" -> ImageCapture.FLASH_MODE_AUTO
      else -> ImageCapture.FLASH_MODE_OFF
    }
    imageCapture?.flashMode = flashMode
  }

  fun capturePhoto(promise: Promise) {
    mainHandler.post {
      val ic = imageCapture ?: run {
        promise.reject("CAPTURE_ERROR", "Camera not ready", null)
        return@post
      }
      val file = File(context.cacheDir, "photo_${System.currentTimeMillis()}.jpg")
      ic.takePicture(
        ImageCapture.OutputFileOptions.Builder(file).build(),
        ContextCompat.getMainExecutor(context),
        object : ImageCapture.OnImageSavedCallback {
          override fun onImageSaved(output: ImageCapture.OutputFileResults) {
            promise.resolve("file://${file.absolutePath}")
          }
          override fun onError(e: ImageCaptureException) {
            Log.e("SeamlessRecorder", "capturePhoto failed: ${e.message}")
            promise.reject("CAPTURE_ERROR", e.message ?: "Unknown error", null)
          }
        }
      )
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
      pendingAction = PendingAction.Switch
      activeRecording?.stop()
    }
  }

  // ── Camera setup ─────────────────────────────────────────────────────────────

  private fun setupCamera() {
    val appCtx = context.applicationContext
    ProcessCameraProvider.getInstance(appCtx).addListener({
      cameraProvider = ProcessCameraProvider.getInstance(appCtx).get()
      pendingFacing?.let { facingFront = it; pendingFacing = null }
      bindCamera()
    }, ContextCompat.getMainExecutor(context))
  }

  private fun buildSelector() = if (facingFront) CameraSelector.DEFAULT_FRONT_CAMERA
                                else CameraSelector.DEFAULT_BACK_CAMERA

  private fun buildQualitySelector() = QualitySelector.fromOrderedList(
    listOf(Quality.HD, Quality.SD, Quality.LOWEST),
    FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)
  )

  // Full rebind (used on init and camera flip). Binds Preview + one output use case.
  private fun bindCamera() {
    if (!isViewAttached) {
      Log.d("SeamlessRecorder", "bindCamera: skipped, view detached")
      return
    }
    val provider = cameraProvider ?: return
    val lifecycle: LifecycleOwner = ProcessLifecycleOwner.get()
    val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }

    try {
      provider.unbindAll()
      if (isVideoMode) {
        val recorder = Recorder.Builder().setQualitySelector(buildQualitySelector()).build()
        val vc = VideoCapture.withOutput(recorder)
        camera = provider.bindToLifecycle(lifecycle, buildSelector(), preview, vc)
        videoCapture = vc
        imageCapture = null
      } else {
        val ic = ImageCapture.Builder().setFlashMode(flashMode).build()
        camera = provider.bindToLifecycle(lifecycle, buildSelector(), preview, ic)
        imageCapture = ic
        videoCapture = null
      }
      Log.d("SeamlessRecorder", "bindCamera OK mode=${if (isVideoMode) "video" else "photo"} facing=${if (facingFront) "front" else "back"}")
      pendingZoom?.let { camera?.cameraControl?.setLinearZoom(it); pendingZoom = null }
      pendingTorch?.let { camera?.cameraControl?.enableTorch(it); pendingTorch = null }
    } catch (e: Exception) {
      Log.e("SeamlessRecorder", "bindCamera failed: ${e.message}")
      camera = null
      videoCapture = null
      imageCapture = null
    }
  }

  // ── Recording ────────────────────────────────────────────────────────────────

  private fun beginClip() {
    val vc = videoCapture ?: run {
      Log.e("SeamlessRecorder", "beginClip: videoCapture is null — camera not ready yet")
      return
    }
    val file = File(context.cacheDir, "clip_${System.currentTimeMillis()}.mp4")
    Log.d("SeamlessRecorder", "beginClip: starting clip at ${file.absolutePath}")
    val prepared = vc.output.prepareRecording(context, FileOutputOptions.Builder(file).build())
    val hasAudio = ContextCompat.checkSelfPermission(context, android.Manifest.permission.RECORD_AUDIO) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
    activeRecording = (if (hasAudio) prepared.withAudioEnabled() else prepared)
      .start(ContextCompat.getMainExecutor(context), buildEventListener(file))
  }

  private fun buildEventListener(file: File): Consumer<VideoRecordEvent> =
    Consumer { event ->
      if (event !is VideoRecordEvent.Finalize) return@Consumer

      activeRecording = null
      if (!event.hasError()) {
        clipUris.add("file://${file.absolutePath}")
      } else {
        Log.e("SeamlessRecorder", "Clip error code=${event.error} cause=${event.cause?.javaClass?.simpleName} msg=${event.cause?.message}", event.cause)
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
}
