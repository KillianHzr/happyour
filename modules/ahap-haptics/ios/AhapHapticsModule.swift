import ExpoModulesCore
import CoreHaptics

// Joue des patterns haptiques AHAP (Core Haptics, iOS 13+) à partir du contenu JSON brut
// envoyé depuis le JS. On utilise `playPattern(from: Data)` qui consomme directement le format
// AHAP, ce qui évite de bundler des ressources ou de convertir les clés du dictionnaire.
public class AhapHapticsModule: Module {
  private var engine: CHHapticEngine?
  // Lecteur continu pour un retour haptique soutenu dont l'intensité s'ajuste en direct
  // (ex: slider de déverrouillage). Reste actif tant que le doigt n'a pas relâché.
  private var continuousPlayer: CHHapticAdvancedPatternPlayer?

  public func definition() -> ModuleDefinition {
    Name("AhapHaptics")

    Function("playPattern") { (json: String) in
      self.play(json: json)
    }

    // Démarre une vibration continue (intensité/netteté de départ 0–1).
    Function("startContinuous") { (intensity: Double, sharpness: Double) in
      self.startContinuous(intensity: Float(intensity), sharpness: Float(sharpness))
    }

    // Met à jour l'intensité (et la netteté) de la vibration continue en cours.
    Function("updateContinuous") { (intensity: Double, sharpness: Double) in
      self.updateContinuous(intensity: Float(intensity), sharpness: Float(sharpness))
    }

    // Arrête la vibration continue.
    Function("stopContinuous") {
      self.stopContinuous()
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

  // ── Vibration continue à intensité dynamique ──

  private func clamp01(_ v: Float) -> Float { max(0, min(1, v)) }

  private func startContinuous(intensity: Float, sharpness: Float) {
    guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
    do {
      try ensureEngine()
      try engine?.start()
      // Stoppe un éventuel lecteur précédent avant d'en recréer un.
      try? continuousPlayer?.stop(atTime: CHHapticTimeImmediate)

      // Événement continu de longue durée (30s) : on ne le laisse jamais finir tout seul,
      // c'est stopContinuous (relâchement du doigt) qui l'arrête.
      let event = CHHapticEvent(
        eventType: .hapticContinuous,
        parameters: [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: clamp01(intensity)),
          CHHapticEventParameter(parameterID: .hapticSharpness, value: clamp01(sharpness)),
        ],
        relativeTime: 0,
        duration: 30
      )
      let pattern = try CHHapticPattern(events: [event], parameters: [])
      let player = try engine?.makeAdvancedPlayer(with: pattern)
      try player?.start(atTime: CHHapticTimeImmediate)
      continuousPlayer = player
    } catch {
      // Best-effort.
    }
  }

  private func updateContinuous(intensity: Float, sharpness: Float) {
    guard let player = continuousPlayer else { return }
    // Paramètres dynamiques appliqués en direct, sans recréer le pattern → vibration fluide.
    let params = [
      CHHapticDynamicParameter(parameterID: .hapticIntensityControl, value: clamp01(intensity), relativeTime: 0),
      CHHapticDynamicParameter(parameterID: .hapticSharpnessControl, value: clamp01(sharpness), relativeTime: 0),
    ]
    try? player.sendParameters(params, atTime: CHHapticTimeImmediate)
  }

  private func stopContinuous() {
    try? continuousPlayer?.stop(atTime: CHHapticTimeImmediate)
    continuousPlayer = nil
  }
}
