package com.example.android_project.util

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import retrofit2.Response

/**
 * 서버 오류 응답 형식
 *   { "error": { "code": "ROOM_FULL", "message": "방 정원이 가득 찼습니다.", "details": ... } }
 */
object ApiError {

    private fun errorObject(body: String?): JsonObject? {
        if (body.isNullOrBlank()) return null
        return try {
            JsonParser.parseString(body)
                .asJsonObject
                .getAsJsonObject("error")
        } catch (e: Exception) {
            null
        }
    }

    // 오류 코드 (예: TOKEN_EXPIRED). 형식이 다르면 null
    fun codeOf(body: String?): String? =
        errorObject(body)?.get("code")?.takeIf { it.isJsonPrimitive }?.asString

    // 오류 응답을 한 번에 읽은 결과. (오류 본문은 한 번만 읽을 수 있어서 코드·메시지·상세를 함께 돌려준다.)
    data class Info(
        val code: String?,
        val message: String,
        val details: JsonObject?
    )

    fun parse(response: Response<*>, fallback: String = "요청에 실패했습니다."): Info {
        val body = try {
            response.errorBody()?.string()
        } catch (e: Exception) {
            null
        }

        val error = errorObject(body)

        return Info(
            code = error?.get("code")?.takeIf { it.isJsonPrimitive }?.asString,
            message = error?.get("message")?.takeIf { it.isJsonPrimitive }?.asString
                ?: "$fallback (${response.code()})",
            details = error?.get("details")?.takeIf { it.isJsonObject }?.asJsonObject
        )
    }

    // 서버가 준 메시지. 없으면 기본 문구
    fun messageOf(response: Response<*>, fallback: String = "요청에 실패했습니다."): String {
        val body = try {
            response.errorBody()?.string()
        } catch (e: Exception) {
            null
        }

        return errorObject(body)
            ?.get("message")
            ?.takeIf { it.isJsonPrimitive }
            ?.asString
            ?: "$fallback (${response.code()})"
    }
}
