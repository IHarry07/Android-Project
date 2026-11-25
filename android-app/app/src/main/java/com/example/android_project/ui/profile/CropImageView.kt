package com.example.android_project.ui.profile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View

/**
 * 프로필 사진 자르기 화면. 사진을 손가락으로 움직이고 두 손가락으로 확대·축소해서
 * 원 안에 들어올 부분을 맞춘다. 사진이 원 밖으로 벗어나 빈 곳이 생기지는 않는다.
 */
class CropImageView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private var bitmap: Bitmap? = null
    private val matrix = Matrix()
    private val crop = RectF()
    private var minScale = 1f
    private val density = resources.displayMetrics.density

    private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val dimPaint = Paint().apply { color = Color.argb(150, 0, 0, 0) }
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = Paint.Style.STROKE
        strokeWidth = 2 * density
    }
    private val dimPath = Path()

    private var lastX = 0f
    private var lastY = 0f
    private var dragging = false

    private val scaleDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScale(detector: ScaleGestureDetector): Boolean {
            val current = currentScale()
            val target = (current * detector.scaleFactor).coerceIn(minScale, minScale * 6f)
            val factor = target / current
            matrix.postScale(factor, factor, detector.focusX, detector.focusY)
            fixBounds()
            invalidate()
            return true
        }
    })

    fun setBitmap(b: Bitmap) {
        bitmap = b
        reset()
    }

    private fun currentScale(): Float {
        val v = FloatArray(9)
        matrix.getValues(v)
        return v[Matrix.MSCALE_X]
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        val size = minOf(w, h) - 2 * 24 * density
        crop.set((w - size) / 2f, (h - size) / 2f, (w + size) / 2f, (h + size) / 2f)
        reset()
    }

    // 사진이 원을 꽉 채우도록 확대해서 가운데에 놓는다.
    private fun reset() {
        val bmp = bitmap ?: return
        if (crop.isEmpty) return
        minScale = maxOf(crop.width() / bmp.width, crop.height() / bmp.height)
        matrix.reset()
        matrix.postScale(minScale, minScale)
        matrix.postTranslate(
            crop.centerX() - bmp.width * minScale / 2f,
            crop.centerY() - bmp.height * minScale / 2f
        )
        invalidate()
    }

    // 사진이 자르는 영역을 항상 덮도록 위치를 보정한다.
    private fun fixBounds() {
        val bmp = bitmap ?: return
        val r = RectF(0f, 0f, bmp.width.toFloat(), bmp.height.toFloat())
        matrix.mapRect(r)
        var dx = 0f
        var dy = 0f
        if (r.left > crop.left) dx = crop.left - r.left
        if (r.right < crop.right) dx = crop.right - r.right
        if (r.top > crop.top) dy = crop.top - r.top
        if (r.bottom < crop.bottom) dy = crop.bottom - r.bottom
        matrix.postTranslate(dx, dy)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        scaleDetector.onTouchEvent(event)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                lastX = event.x
                lastY = event.y
                dragging = true
            }
            MotionEvent.ACTION_POINTER_DOWN -> dragging = false
            MotionEvent.ACTION_POINTER_UP -> {
                // 한 손가락이 남으면 그 손가락 기준으로 다시 끌 수 있게 한다.
                val idx = if (event.actionIndex == 0) 1 else 0
                lastX = event.getX(idx)
                lastY = event.getY(idx)
                dragging = true
            }
            MotionEvent.ACTION_MOVE -> if (dragging && !scaleDetector.isInProgress && event.pointerCount == 1) {
                matrix.postTranslate(event.x - lastX, event.y - lastY)
                fixBounds()
                lastX = event.x
                lastY = event.y
                invalidate()
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> dragging = false
        }
        return true
    }

    override fun onDraw(canvas: Canvas) {
        val bmp = bitmap ?: return
        canvas.drawBitmap(bmp, matrix, bitmapPaint)

        // 원 밖은 어둡게
        dimPath.reset()
        dimPath.addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
        dimPath.addCircle(crop.centerX(), crop.centerY(), crop.width() / 2f, Path.Direction.CCW)
        dimPath.fillType = Path.FillType.EVEN_ODD
        canvas.drawPath(dimPath, dimPaint)
        canvas.drawCircle(crop.centerX(), crop.centerY(), crop.width() / 2f, ringPaint)
    }

    /** 원 안에 보이는 부분을 정사각형 사진으로 잘라 돌려준다. */
    fun crop(outSize: Int = 512): Bitmap? {
        val bmp = bitmap ?: return null
        val out = Bitmap.createBitmap(outSize, outSize, Bitmap.Config.ARGB_8888)
        val m = Matrix(matrix)
        m.postTranslate(-crop.left, -crop.top)
        val s = outSize / crop.width()
        m.postScale(s, s)
        Canvas(out).apply {
            drawColor(Color.WHITE) // JPEG에는 투명이 없으므로 바탕을 흰색으로 둔다.
            drawBitmap(bmp, m, bitmapPaint)
        }
        return out
    }
}