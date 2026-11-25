package com.example.android_project.data

import android.content.Context
import com.example.android_project.model.ChangeAccountRequest
import com.example.android_project.model.ChangePasswordRequest
import com.example.android_project.model.UpdateMeRequest
import com.example.android_project.util.TokenManager
import com.google.gson.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Response

class UserRepository(context: Context) {

    private val tokenManager = TokenManager(context)
    private val api = RetrofitClient.userApiService

    private fun auth(): String? = tokenManager.getToken()?.let { "Bearer $it" }

    suspend fun getMe(): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.getMe(token)
    }

    suspend fun updateMe(request: UpdateMeRequest): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.updateMe(token, request)
    }

    suspend fun withdraw(password: String, sharedItems: String?): Response<JsonObject>? {
        val token = auth() ?: return null
        val body = JsonObject().apply {
            addProperty("password", password)
            if (sharedItems != null) addProperty("sharedItems", sharedItems)
        }
        return api.withdraw(token, body)
    }

    suspend fun uploadPhoto(jpeg: ByteArray): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.uploadPhoto(token, jpeg.toRequestBody("image/jpeg".toMediaType()))
    }

    suspend fun deletePhoto(): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.deletePhoto(token)
    }

    suspend fun setPhotoVisibility(photoPublic: Boolean): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.setPhotoVisibility(token, JsonObject().apply { addProperty("photoPublic", photoPublic) })
    }

    suspend fun changePassword(currentPassword: String, newPassword: String): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.changePassword(token, ChangePasswordRequest(currentPassword, newPassword))
    }

    suspend fun changeAccount(currentPassword: String, accountInfo: String): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.changeAccount(token, ChangeAccountRequest(currentPassword, accountInfo))
    }
}
