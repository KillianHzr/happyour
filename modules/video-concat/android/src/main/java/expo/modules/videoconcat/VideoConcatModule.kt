package expo.modules.videoconcat

import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

@androidx.annotation.OptIn(UnstableApi::class)
class VideoConcatModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VideoConcat")

    AsyncFunction("concatVideos") { uris: List<String>, promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("CONCAT_ERROR", "No context", null)
        return@AsyncFunction
      }

      val outputFile = File(context.cacheDir, "merged_${System.currentTimeMillis()}.mp4")

      // Transformer must be created and started on a Looper thread
      Handler(Looper.getMainLooper()).post {
        try {
          val editedItems = uris.map { uriString ->
            val uri = when {
              uriString.startsWith("content://") -> Uri.parse(uriString)
              uriString.startsWith("file://") -> Uri.parse(uriString)
              else -> Uri.fromFile(File(uriString))
            }
            EditedMediaItem.Builder(MediaItem.fromUri(uri)).build()
          }

          val composition = Composition.Builder(
            EditedMediaItemSequence(editedItems)
          ).build()

          Transformer.Builder(context)
            .setVideoMimeType(MimeTypes.VIDEO_H265) // input is H.264 → forces re-encode, fixes SPS/PPS mismatch between cameras
            .addListener(object : Transformer.Listener {
              override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                promise.resolve("file://${outputFile.absolutePath}")
              }
              override fun onError(
                composition: Composition,
                exportResult: ExportResult,
                exportException: ExportException
              ) {
                promise.reject("CONCAT_ERROR", exportException.message ?: "Export failed", exportException)
              }
            })
            .build()
            .start(composition, outputFile.absolutePath)
        } catch (e: Exception) {
          promise.reject("CONCAT_ERROR", e.message ?: "Unknown error", e)
        }
      }
    }
  }
}
