import SwiftUI
import WebKit

/// The page's paper colour (#FFFAF0), shown while the web view loads so launch
/// flows straight into the opening screen without a white flash.
private let paper = UIColor(red: 1, green: 250 / 255, blue: 240 / 255, alpha: 1)

struct WebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)

        webView.isOpaque = false
        webView.backgroundColor = paper
        webView.scrollView.backgroundColor = paper
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 26.0, *) {
            // The page is full-bleed artwork: no system blur under the status bar or edges.
            let scrollView = webView.scrollView
            for edge in [scrollView.topEdgeEffect, scrollView.bottomEdgeEffect, scrollView.leftEdgeEffect, scrollView.rightEdgeEffect] {
                edge.isHidden = true
            }
        }

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
            .background(Color(paper))
            .ignoresSafeArea()
    }
}

#Preview {
    ContentView()
}
