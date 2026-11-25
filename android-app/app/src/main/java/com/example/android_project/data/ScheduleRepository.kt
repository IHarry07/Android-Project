package com.example.android_project.data

import android.content.Context
import com.example.android_project.model.CleaningActionRequest
import com.example.android_project.model.CreateScheduleRequest
import com.example.android_project.model.PostponeCleaningRequest
import com.example.android_project.model.ReassignCleaningRequest
import com.example.android_project.model.SaveCleaningSettingsRequest
import com.example.android_project.util.TokenManager
import com.google.gson.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Response

class ScheduleRepository(context: Context) {

    private val tokenManager = TokenManager(context)
    private val api = RetrofitClient.scheduleApiService

    private fun auth(): String? = tokenManager.getToken()?.let { "Bearer $it" }

    suspend fun list(roomId: Int, from: String, to: String): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.listSchedules(token, roomId, from, to)
    }

    suspend fun create(roomId: Int, request: CreateScheduleRequest): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.createSchedule(token, roomId, request)
    }

    // null 값(알림 없음 등)도 그대로 보내는 일정 추가
    suspend fun createJson(roomId: Int, body: JsonObject): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.createScheduleRaw(token, roomId, body.toString().toRequestBody("application/json".toMediaType()))
    }

    // 바꿀 항목만 담은 JSON. JsonNull은 서버에 null(값 지우기)로 전달된다.
    suspend fun update(roomId: Int, scheduleId: Int, changes: JsonObject): Response<JsonObject>? {
        val token = auth() ?: return null
        val body = changes.toString().toRequestBody("application/json".toMediaType())
        return api.updateSchedule(token, roomId, scheduleId, body)
    }

    // 청소당번 설정 (구성원별 담당 구역·요일, 반복 주기, 순번 순환)
    suspend fun getCleaningSettings(roomId: Int): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.getCleaningSettings(token, roomId)
    }

    suspend fun saveCleaningSettings(roomId: Int, request: SaveCleaningSettingsRequest): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.saveCleaningSettings(token, roomId, request)
    }

    // 청소 처리 (완료 / 건너뛰기 / 미루기)
    suspend fun completeCleaning(roomId: Int, taskId: Int, request: CleaningActionRequest): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.completeCleaning(token, roomId, taskId, request)
    }

    suspend fun skipCleaning(roomId: Int, taskId: Int, request: CleaningActionRequest): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.skipCleaning(token, roomId, taskId, request)
    }

    suspend fun postponeCleaning(roomId: Int, taskId: Int, request: PostponeCleaningRequest): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.postponeCleaning(token, roomId, taskId, request)
    }

    suspend fun reassignCleaning(roomId: Int, taskId: Int, request: ReassignCleaningRequest): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.reassignCleaning(token, roomId, taskId, request)
    }

    // 청소 이력(완료·건너뜀·미룸·담당자 변경). taskId가 없으면 방 전체
    suspend fun listCleaningHistory(roomId: Int, taskId: Int? = null, limit: Int = 50): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.listCleaningHistory(token, roomId, taskId, limit)
    }

    suspend fun listCleaningRecords(roomId: Int, taskId: Int, limit: Int = 20): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.listCleaningRecords(token, roomId, taskId, limit)
    }

    // 진행 중인 청소 당번
    suspend fun listCleaningTasks(roomId: Int): Response<JsonObject>? {
        val token = auth() ?: return null
        return api.listCleaningTasks(token, roomId, "true")
    }

    suspend fun delete(roomId: Int, scheduleId: Int): Response<Void>? {
        val token = auth() ?: return null
        return api.deleteSchedule(token, roomId, scheduleId)
    }
}
