import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)

        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        if let webFolder = Bundle.main.resourceURL?
            .appendingPathComponent("web", isDirectory: true) {

            let indexURL = webFolder.appendingPathComponent("index.html")

            webView.loadFileURL(
                indexURL,
                allowingReadAccessTo: webFolder
            )
        } else {
            print("ERROR: web folder not found in app bundle")
        }

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
    }
}

struct ContentView: View {
    var body: some View {
        WebView()
            .ignoresSafeArea()
    }
}

#Preview {
    ContentView()
}
