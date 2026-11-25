package com.example.android_project.data

import android.content.Context
import com.example.android_project.util.TokenManager
import com.google.gson.JsonObject
import retrofit2.Response

class NotificationRepository(context: Context) {

    private val tokenManager = TokenManager(context)
    private val api = RetrofitClient.notificationApiService

    private fun auth(): String? = tokenManager.getToken()?.let { "Bearer $it" }

    suspend fun list(filter: String = "all", limit: Int = 30, beforeId: Int? = null): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.list(token, filter, limit, beforeId)
    }

    suspend fun unreadCount(): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.unreadCount(token)
    }

    suspend fun getSettings(): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.getSettings(token)
    }

    suspend fun updateSettings(body: JsonObject): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.updateSettings(token, body)
    }

    suspend fun markRead(id: Int): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.markRead(token, id)
    }

    suspend fun markAllRead(): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.markAllRead(token)
    }

    suspend fun delete(id: Int): Response<Void>? {
        val token = auth() ?: return null
        return api.delete(token, id)
    }

    suspend fun deleteAllRead(): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.deleteAllRead(token)
    }
}
