import ExpoModulesCore

public class SeamlessRecorderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SeamlessRecorder")

    View(SeamlessRecorderView.self) {
      Prop("facing") { (view: SeamlessRecorderView, facing: String) in
        view.setFacing(facing)
      }
    }

    AsyncFunction("startRecording") { (viewTag: Int, promise: Promise) in
      DispatchQueue.main.async {
        guard let view = self.appContext?.findView(withTag: viewTag, ofType: SeamlessRecorderView.self) else {
          promise.reject("VIEW_NOT_FOUND", "SeamlessRecorderView not found for tag \(viewTag)")
          return
        }
        view.startRecording()
        promise.resolve(nil)
      }
    }

    AsyncFunction("stopRecording") { (viewTag: Int, promise: Promise) in
      DispatchQueue.main.async {
        guard let view = self.appContext?.findView(withTag: viewTag, ofType: SeamlessRecorderView.self) else {
          promise.reject("VIEW_NOT_FOUND", "SeamlessRecorderView not found for tag \(viewTag)")
          return
        }
        view.stopRecording(promise: promise)
      }
    }

    AsyncFunction("switchCamera") { (viewTag: Int, promise: Promise) in
      DispatchQueue.main.async {
        guard let view = self.appContext?.findView(withTag: viewTag, ofType: SeamlessRecorderView.self) else {
          promise.reject("VIEW_NOT_FOUND", "SeamlessRecorderView not found for tag \(viewTag)")
          return
        }
        view.performSwitch()
        promise.resolve(nil)
      }
    }
  }
}
