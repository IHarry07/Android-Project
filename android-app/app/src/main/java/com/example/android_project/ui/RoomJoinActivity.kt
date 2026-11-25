package com.example.android_project.ui.room

import android.os.Bundle
import android.widget.Button
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.EditText
import android.widget.ImageView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.RoomRepository
import com.example.android_project.util.ApiError
import kotlinx.coroutines.launch

class RoomJoinActivity : com.example.android_project.ui.BaseActivity() {

    private lateinit var roomRepository: RoomRepository
    private lateinit var etRoomCode: EditText
    private lateinit var btnJoinRoom: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_room_join)

        roomRepository = RoomRepository(this)

        etRoomCode = findViewById(R.id.etRoomCode)
        btnJoinRoom = findViewById(R.id.btnJoinRoom)

        btnJoinRoom.setOnClickListener {
            joinRoom()
        }

        findViewById<ImageView>(R.id.ivBack).setOnClickListener { finish() }

        // 6자 이상 입력하면 확인 표시
        val ivCodeOk = findViewById<ImageView>(R.id.ivCodeOk)
        etRoomCode.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                ivCodeOk.visibility =
                    if ((s?.length ?: 0) >= 6) View.VISIBLE else View.INVISIBLE
            }
        })
    }

    private fun joinRoom() {
        val roomCode = etRoomCode.text.toString().trim()

        if (roomCode.isEmpty()) {
            etRoomCode.error = "방 참여 코드를 입력해 주세요."
            return
        }

        btnJoinRoom.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = roomRepository.joinRoom(roomCode)

                if (response == null) {
                    com.example.android_project.util.Msg.makeText(
                        this@RoomJoinActivity,
                        "로그인이 필요합니다.",
                        Toast.LENGTH_SHORT
                    ).show()
                    return@launch
                }

                if (response.isSuccessful) {
                    com.example.android_project.util.Msg.makeText(
                        this@RoomJoinActivity,
                        "방에 참여했습니다.",
                        Toast.LENGTH_SHORT
                    ).show()

                    finish()

                } else {
                    com.example.android_project.util.Msg.makeText(
                        this@RoomJoinActivity,
                        ApiError.messageOf(response, "방 참여 실패"),
                        Toast.LENGTH_LONG
                    ).show()
                }

            } catch (e: Exception) {
                com.example.android_project.util.Msg.makeText(
                    this@RoomJoinActivity,
                    "오류 발생: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()

            } finally {
                btnJoinRoom.isEnabled = true
            }
        }
    }
}
