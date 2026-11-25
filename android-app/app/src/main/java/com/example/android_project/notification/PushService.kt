package com.example.android_project.notification

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** 서버가 보낸 푸시를 받아 알림창에 띄운다. */
class PushService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        PushRegistration.send(this, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val title = data["title"] ?: return
        val body = data["body"].orEmpty()
        PhoneNotifications.show(
            this,
            id = (System.currentTimeMillis() % Int.MAX_VALUE).toInt(),
            title = title,
            body = body,
            targetType = data["targetType"]
        )
    }
}