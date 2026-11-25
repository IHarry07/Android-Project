package com.example.android_project.ui.item

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.widget.ImageView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.example.android_project.R
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * QR 코드를 읽어 그 내용을 호출한 화면에 돌려준다. (결과: EXTRA_QR_VALUE)
 * 상품명 조회와 등록은 이 화면이 하지 않는다. (ItemFormActivity가 서버에 조회한다.)
 */
@ExperimentalGetImage
class QrScanActivity : com.example.android_project.ui.BaseActivity() {

    companion object {
        const val EXTRA_QR_VALUE = "qr_value"
    }

    private lateinit var previewView: PreviewView
    private lateinit var tvGuide: TextView
    private lateinit var cameraExecutor: ExecutorService

    private val detected = AtomicBoolean(false)

    private val scanner by lazy {
        BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .build()
        )
    }

    private val requestCameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCamera()
            else tvGuide.text = "카메라 권한이 있어야 QR을 읽을 수 있어요.\n설정에서 권한을 허용해 주세요."
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_qr_scan)

        previewView = findViewById(R.id.previewView)
        tvGuide = findViewById(R.id.tvScanGuide)
        cameraExecutor = Executors.newSingleThreadExecutor()

        findViewById<ImageView>(R.id.ivBack).setOnClickListener { finish() }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            startCamera()
        } else {
            requestCameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    private fun startCamera() {
        val providerFuture = ProcessCameraProvider.getInstance(this)

        providerFuture.addListener({
            val provider = providerFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }

            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()

            analysis.setAnalyzer(cameraExecutor) { imageProxy ->
                val mediaImage = imageProxy.image

                if (detected.get() || mediaImage == null) {
                    imageProxy.close()
                    return@setAnalyzer
                }

                val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)

                scanner.process(image)
                    .addOnSuccessListener { barcodes ->
                        val value = barcodes
                            .firstOrNull { it.format == Barcode.FORMAT_QR_CODE }
                            ?.rawValue

                        // 한 번만 처리한다.
                        if (value != null && detected.compareAndSet(false, true)) {
                            runOnUiThread {
                                setResult(
                                    RESULT_OK,
                                    Intent().putExtra(EXTRA_QR_VALUE, value)
                                )
                                finish()
                            }
                        }
                    }
                    .addOnFailureListener { e -> Log.e("QR_SCAN", "QR 인식 실패", e) }
                    .addOnCompleteListener { imageProxy.close() }
            }

            try {
                provider.unbindAll()
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
            } catch (e: Exception) {
                Log.e("QR_SCAN", "카메라 실행 실패", e)
                tvGuide.text = "카메라를 켜지 못했어요.\n(${e.message})"
            }
        }, ContextCompat.getMainExecutor(this))
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        scanner.close()
    }
}
