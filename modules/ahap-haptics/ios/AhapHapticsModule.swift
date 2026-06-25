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

      // IMPORTANT : `hapticIntensityControl` (paramètre dynamique) est un MULTIPLICATEUR de
      // l'intensité de base de l'événement. On crée donc l'événement à intensité PLEINE (1.0)
      // pour que le contrôle dynamique 0–1 corresponde directement à l'intensité ressentie.
      // (Avant, la base valait l'intensité de départ ~0.15 → tout était plafonné très bas →
      // on ne sentait quasi rien jusqu'à la fin.)
      let event = CHHapticEvent(
        eventType: .hapticContinuous,
        parameters: [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
          // Base neutre 0.5 ; la netteté réelle est pilotée par l'offset dynamique (cf. update).
          CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5),
        ],
        relativeTime: 0,
        duration: 30 // longue durée ; c'est stopContinuous (doigt relâché) qui l'arrête.
      )
      let pattern = try CHHapticPattern(events: [event], parameters: [])
      let player = try engine?.makeAdvancedPlayer(with: pattern)
      try player?.start(atTime: CHHapticTimeImmediate)
      continuousPlayer = player
      // Applique l'intensité de départ via le contrôle dynamique.
      updateContinuous(intensity: intensity, sharpness: sharpness)
    } catch {
      // Best-effort.
    }
  }

  private func updateContinuous(intensity: Float, sharpness: Float) {
    guard let player = continuousPlayer else { return }
    // Intensité = multiplicateur 0–1 appliqué en direct (base événement = 1.0).
    // Netteté = offset additif (base 0.5) → on recadre autour de 0.5.
    let params = [
      CHHapticDynamicParameter(parameterID: .hapticIntensityControl, value: clamp01(intensity), relativeTime: 0),
      CHHapticDynamicParameter(parameterID: .hapticSharpnessControl, value: max(-1, min(1, sharpness - 0.5)), relativeTime: 0),
    ]
    try? player.sendParameters(params, atTime: CHHapticTimeImmediate)
  }

  private func stopContinuous() {
    try? continuousPlayer?.stop(atTime: CHHapticTimeImmediate)
    continuousPlayer = nil
  }
}
