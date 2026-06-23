import ExpoModulesCore
import CoreHaptics

// Joue des patterns haptiques AHAP (Core Haptics, iOS 13+) à partir du contenu JSON brut
// envoyé depuis le JS. On utilise `playPattern(from: Data)` qui consomme directement le format
// AHAP, ce qui évite de bundler des ressources ou de convertir les clés du dictionnaire.
public class AhapHapticsModule: Module {
  private var engine: CHHapticEngine?

  public func definition() -> ModuleDefinition {
    Name("AhapHaptics")

    Function("playPattern") { (json: String) in
      self.play(json: json)
    }
  }

  private func ensureEngine() throws {
    if engine == nil {
      let newEngine = try CHHapticEngine()
      newEngine.isAutoShutdownEnabled = true
      // Le moteur peut être réinitialisé par le système (ex. interruption audio) : on le relance.
      newEngine.resetHandler = { [weak self] in
        try? self?.engine?.start()
      }
      engine = newEngine
    }
  }

  private func play(json: String) {
    // Pas de haptique sur le matériel non compatible (iPad, simulateur…).
    guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
    guard let data = json.data(using: .utf8) else { return }
    do {
      try ensureEngine()
      try engine?.start()
      try engine?.playPattern(from: data)
    } catch {
      // Best-effort : un échec haptique ne doit jamais casser le flux JS.
    }
  }
}
