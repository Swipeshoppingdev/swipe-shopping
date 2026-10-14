import AuthenticationServices
import Capacitor
import UIKit

/// "Accedi con Apple" nativo (foglio di sistema con Face ID). Restituisce il token che l'app passa a Supabase
/// (signInWithIdToken). Plugin locale: registrato da MainViewController, nessuna libreria esterna.
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding
{
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]
    private var pending: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        pending = call
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email]
        // Hash SHA-256 del nonce: Supabase controlla che corrisponda a quello in chiaro.
        request.nonce = call.getString("nonce")
        DispatchQueue.main.async {
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(
        controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let data = credential.identityToken, let token = String(data: data, encoding: .utf8)
        else {
            pending?.reject("Apple non ha restituito il token.")
            pending = nil
            return
        }
        pending?.resolve(["identityToken": token, "email": credential.email ?? ""])
        pending = nil
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let canceled = (error as? ASAuthorizationError)?.code == .canceled
        pending?.reject(canceled ? "canceled" : error.localizedDescription, canceled ? "canceled" : nil)
        pending = nil
    }
}

/// Il controller principale di Capacitor, con in più i plugin locali dell'app.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleSignInPlugin())
    }
}
