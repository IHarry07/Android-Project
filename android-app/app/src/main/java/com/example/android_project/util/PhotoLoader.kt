package com.example.android_project.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import android.view.View
import android.widget.ImageView
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import com.example.android_project.data.RetrofitClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 프로필 사진 불러오기. 사진은 로그인해야 받을 수 있어서 토큰을 붙여 받고, (회원번호, 버전)별로 메모리에 보관한다.
 * 사진을 바꾸면 서버가 버전을 바꿔 주므로 새 사진이 자동으로 다시 받아진다.
 */
object PhotoLoader {

    private val cache = object : LruCache<String, Bitmap>(
        (Runtime.getRuntime().maxMemory() / 16).toInt()
    ) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }

    private fun key(userId: Int, version: Long) = "$userId:$version"

    suspend fun load(context: Context, userId: Int, version: Long): Bitmap? {
        cache.get(key(userId, version))?.let { return it }
        val token = TokenManager(context).getToken()?.let { "Bearer $it" } ?: return null
        return withContext(Dispatchers.IO) {
            try {
                val response = RetrofitClient.userApiService.photo(token, userId)
                if (!response.isSuccessful) return@withContext null
                val bytes = response.body()?.bytes() ?: return@withContext null
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.also { cache.put(key(userId, version), it) }
            } catch (e: Exception) {
                null
            }
        }
    }

    /** 사진이 있으면 사진을, 없으면 기본 사람 아이콘(placeholder)을 보여준다. */
    fun bind(owner: LifecycleOwner, context: Context, photo: ImageView, placeholder: View, userId: Int, version: Long?) {
        photo.tag = userId
        if (version == null) {
            photo.visibility = View.GONE
            placeholder.visibility = View.VISIBLE
            return
        }
        val cached = cache.get(key(userId, version))
        if (cached != null) {
            photo.setImageBitmap(cached)
            photo.visibility = View.VISIBLE
            placeholder.visibility = View.GONE
            return
        }
        photo.visibility = View.GONE
        placeholder.visibility = View.VISIBLE
        owner.lifecycleScope.launch {
            val bitmap = load(context, userId, version) ?: return@launch
            if (photo.tag != userId) return@launch
            photo.setImageBitmap(bitmap)
            photo.visibility = View.VISIBLE
            placeholder.visibility = View.GONE
        }
    }
}