package com.example.android_project.ui.profile

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Bundle
import android.view.View
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.ui.BaseActivity
import com.example.android_project.util.Msg
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * 프로필 사진 자르기. 촬영하거나 고른 사진을 받아서 원 안에 맞춘 뒤,
 * 정사각형 JPEG(512px)로 저장하고 그 파일 경로를 돌려준다.
 */
class PhotoCropActivity : BaseActivity() {

    companion object {
        const val EXTRA_URI = "uri"
        const val EXTRA_OUTPUT = "output"
    }

    private lateinit var cropView: CropImageView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_photo_crop)
        cropView = findViewById(R.id.cropView)

        findViewById<View>(R.id.btnCropCancel).setOnClickListener { finish() }
        val done = findViewById<View>(R.id.btnCropDone)
        done.isEnabled = false
        done.setOnClickListener { save() }

        val uri = intent.getStringExtra(EXTRA_URI)?.let { Uri.parse(it) }
        if (uri == null) {
            finish()
            return
        }
        lifecycleScope.launch {
            val bitmap = withContext(Dispatchers.IO) { decode(uri) }
            if (bitmap == null) {
                Msg.show(this@PhotoCropActivity, "사진을 불러오지 못했어요.")
                finish()
            } else {
                cropView.setBitmap(bitmap)
                done.isEnabled = true
            }
        }
    }

    // 너무 큰 사진은 줄여서 읽고, 폰을 돌려 찍은 사진은 바로 세운다.
    private fun decode(uri: Uri): Bitmap? = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 2048) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val raw = contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }

        val orientation = contentResolver.openInputStream(uri)?.use {
            ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        } ?: ExifInterface.ORIENTATION_NORMAL
        val m = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
        }
        if (raw != null && !m.isIdentity) Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true) else raw
    } catch (e: Exception) {
        null
    }

    private fun save() {
        val result = cropView.crop(512) ?: return
        lifecycleScope.launch {
            val file = withContext(Dispatchers.IO) {
                val f = File(cacheDir, "profile_photo.jpg")
                FileOutputStream(f).use { result.compress(Bitmap.CompressFormat.JPEG, 88, it) }
                f
            }
            setResult(Activity.RESULT_OK, Intent().putExtra(EXTRA_OUTPUT, file.absolutePath))
            finish()
        }
    }
}