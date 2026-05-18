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
