package expo.modules.seamlessrecorder

import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SeamlessRecorderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SeamlessRecorder")

    View(SeamlessRecorderView::class) {
      Prop("facing") { view: SeamlessRecorderView, facing: String ->
        view.setFacing(facing)
      }
      Prop("zoom") { view: SeamlessRecorderView, zoom: Double ->
        view.setZoom(zoom)
      }
      Prop("torch") { view: SeamlessRecorderView, on: Boolean ->
        view.setTorch(on)
      }
      Prop("flash") { view: SeamlessRecorderView, mode: String ->
        view.setFlash(mode)
      }
      Prop("videoMode") { view: SeamlessRecorderView, video: Boolean ->
        view.setVideoMode(video)
      }
    }

    AsyncFunction("capturePhoto") { viewTag: Int, promise: Promise ->
      Handler(Looper.getMainLooper()).post {
        val view = appContext.findView<SeamlessRecorderView>(viewTag)
        if (view == null) {
          promise.reject("VIEW_NOT_FOUND", "SeamlessRecorderView not found for tag $viewTag", null)
          return@post
        }
        view.capturePhoto(promise)
      }
    }

    AsyncFunction("startRecording") { viewTag: Int, promise: Promise ->
      Handler(Looper.getMainLooper()).post {
        val view = appContext.findView<SeamlessRecorderView>(viewTag)
        if (view == null) {
          promise.reject("VIEW_NOT_FOUND", "SeamlessRecorderView not found for tag $viewTag", null)
          return@post
        }
        view.startRecording()
        promise.resolve(null)
      }
    }

    AsyncFunction("stopRecording") { viewTag: Int, promise: Promise ->
      Handler(Looper.getMainLooper()).post {
        val view = appContext.findView<SeamlessRecorderView>(viewTag)
        if (view == null) {
          promise.reject("VIEW_NOT_FOUND", "SeamlessRecorderView not found for tag $viewTag", null)
          return@post
        }
        view.stopRecording(promise)
      }
    }

    AsyncFunction("switchCamera") { viewTag: Int, promise: Promise ->
      Handler(Looper.getMainLooper()).post {
        val view = appContext.findView<SeamlessRecorderView>(viewTag)
        if (view == null) {
          promise.reject("VIEW_NOT_FOUND", "SeamlessRecorderView not found for tag $viewTag", null)
          return@post
        }
        view.switchCamera()
        promise.resolve(null)
      }
    }
  }
}
