import ExpoModulesCore
import AVFoundation

public class VideoConcatModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VideoConcat")

    AsyncFunction("concatVideos") { (uris: [String], promise: Promise) in
      Task {
        do {
          let result = try await self.concat(uris: uris)
          promise.resolve(result)
        } catch {
          promise.reject("CONCAT_ERROR", error.localizedDescription)
        }
      }
    }
  }

  private func concat(uris: [String]) async throws -> String {
    guard !uris.isEmpty else {
      throw NSError(domain: "VideoConcat", code: 0,
                    userInfo: [NSLocalizedDescriptionKey: "No URIs provided"])
    }

    let composition = AVMutableComposition()

    guard let compVideo = composition.addMutableTrack(
      withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      throw NSError(domain: "VideoConcat", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Could not create video composition track"])
    }
    let compAudio = composition.addMutableTrack(
      withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid
    )

    var cursor = CMTime.zero

    for uriString in uris {
      let url: URL
      if uriString.hasPrefix("file://") {
        guard let u = URL(string: uriString) else { continue }
        url = u
      } else {
        url = URL(fileURLWithPath: uriString)
      }

      let asset = AVURLAsset(url: url)
      let duration = try await asset.load(.duration)
      let range = CMTimeRangeMake(start: .zero, duration: duration)

      let videoTracks = try await asset.loadTracks(withMediaType: .video)
      if let src = videoTracks.first {
        try compVideo.insertTimeRange(range, of: src, at: cursor)
      }

      let audioTracks = try await asset.loadTracks(withMediaType: .audio)
      if let src = audioTracks.first, let compAudio = compAudio {
        try compAudio.insertTimeRange(range, of: src, at: cursor)
      }

      cursor = CMTimeAdd(cursor, duration)
    }

    let outputURL = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("merged_\(Int(Date().timeIntervalSince1970 * 1000)).mp4")
    try? FileManager.default.removeItem(at: outputURL)

    guard let exporter = AVAssetExportSession(
      asset: composition,
      presetName: AVAssetExportPresetHighestQuality
    ) else {
      throw NSError(domain: "VideoConcat", code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Could not create export session"])
    }

    exporter.outputURL = outputURL
    exporter.outputFileType = .mp4
    exporter.shouldOptimizeForNetworkUse = true
    // Force re-encode through the video compositor to fix SPS/PPS mismatch between front/back cameras.
    // Without this, AVAssetExportSession transmuxes (stream-copy) and the codec parameter sets
    // from different cameras are incompatible, causing a broken/black output.
    exporter.videoComposition = AVMutableVideoComposition(propertiesOf: composition)

    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      exporter.exportAsynchronously {
        switch exporter.status {
        case .completed:
          cont.resume()
        case .failed:
          cont.resume(throwing: exporter.error ??
            NSError(domain: "VideoConcat", code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "Export failed"]))
        case .cancelled:
          cont.resume(throwing: NSError(domain: "VideoConcat", code: 4,
                    userInfo: [NSLocalizedDescriptionKey: "Export cancelled"]))
        default:
          cont.resume(throwing: NSError(domain: "VideoConcat", code: 5,
                    userInfo: [NSLocalizedDescriptionKey: "Export unknown error"]))
        }
      }
    }

    return outputURL.absoluteString
  }
}
