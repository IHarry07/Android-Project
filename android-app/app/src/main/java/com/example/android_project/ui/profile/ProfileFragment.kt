package com.example.android_project.ui.profile

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.UserRepository
import com.example.android_project.model.User
import com.example.android_project.ui.LoginActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.TokenManager
import com.google.gson.Gson
import kotlinx.coroutines.launch

// 프로필 탭: 닉네임, 방 이름 · 권한, 활동 요약, 메뉴(내 정보 / 알림 설정 / 자주 묻는 질문 / 고객센터 / 로그아웃)
class ProfileFragment : Fragment() {

    private lateinit var repo: UserRepository
    private lateinit var tvNickname: TextView
    private lateinit var tvRoom: TextView
    private lateinit var tvStatCleaning: TextView
    private lateinit var tvStatHelp: TextView
    private lateinit var ivProfilePhoto: android.widget.ImageView
    private lateinit var ivProfilePlaceholder: View
    private var myUserId = 0
    private var hasPhoto = false
    private var cameraFile: java.io.File? = null

    // 사진 촬영 / 갤러리 선택 / 자르기 결과를 받는다. (프래그먼트가 만들어질 때 등록해야 한다.)
    private val takePicture = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.TakePicture()) { ok ->
        if (ok) cameraFile?.let { openCrop(android.net.Uri.fromFile(it)) }
    }
    private val pickImage = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) openCrop(uri)
    }
    private val cameraPermission = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) launchCamera() else com.example.android_project.util.Msg.show(requireContext(), "카메라 권한이 있어야 사진을 찍을 수 있어요.")
    }
    private val cropResult = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { result ->
        val path = result.data?.getStringExtra(PhotoCropActivity.EXTRA_OUTPUT)
        if (result.resultCode == android.app.Activity.RESULT_OK && path != null) uploadPhoto(java.io.File(path))
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_profile, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        repo = UserRepository(requireContext())

        tvNickname = view.findViewById(R.id.tvProfileNickname)
        tvRoom = view.findViewById(R.id.tvProfileRoom)
        tvStatCleaning = view.findViewById(R.id.tvStatCleaning)
        tvStatHelp = view.findViewById(R.id.tvStatHelp)
        ivProfilePhoto = view.findViewById(R.id.ivProfilePhoto)
        ivProfilePlaceholder = view.findViewById(R.id.ivProfilePlaceholder)
        view.findViewById<View>(R.id.avatarProfile).setOnClickListener { showPhotoMenu() }

        // 완료한 청소와 도움받은 횟수는 서버에서 세어 준다.
        val openMyInfo = View.OnClickListener {
            startActivity(Intent(requireContext(), MyInfoActivity::class.java))
        }
        view.findViewById<View>(R.id.ivEditProfile).setOnClickListener(openMyInfo)
        view.findViewById<View>(R.id.menuMyInfo).setOnClickListener(openMyInfo)

        view.findViewById<View>(R.id.ivSettings).setOnClickListener {
            startActivity(Intent(requireContext(), com.example.android_project.ui.settings.SettingsActivity::class.java))
        }
        view.findViewById<View>(R.id.menuSettlement).setOnClickListener {
            val roomId = (activity as? com.example.android_project.ui.main.MainTabsActivity)?.currentRoom?.roomId
            if (roomId == null) {
                com.example.android_project.util.Msg.show(requireContext(), "참여 중인 방이 없어요.")
            } else {
                startActivity(
                    Intent(requireContext(), com.example.android_project.ui.expense.ExpenseActivity::class.java)
                        .putExtra(com.example.android_project.ui.expense.ExpenseActivity.EXTRA_ROOM_ID, roomId)
                )
            }
        }
        view.findViewById<View>(R.id.menuNotification).setOnClickListener {
            startActivity(Intent(requireContext(), com.example.android_project.ui.settings.NotificationSettingsActivity::class.java))
        }

        view.findViewById<View>(R.id.menuFaq).setOnClickListener {
            startActivity(Intent(requireContext(), com.example.android_project.ui.support.FaqActivity::class.java))
        }
        view.findViewById<View>(R.id.menuSupport).setOnClickListener {
            startActivity(Intent(requireContext(), com.example.android_project.ui.support.SupportActivity::class.java))
        }
        view.findViewById<View>(R.id.menuLogout).setOnClickListener { confirmLogout() }
    }

    // 내 정보를 고치고 돌아왔을 때도 최신 닉네임이 보이도록 화면에 들어올 때마다 불러온다.
    override fun onResume() {
        super.onResume()
        load()
    }

    private fun load() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = repo.getMe() ?: return@launch

                if (response.isSuccessful) {
                    val json = response.body()?.getAsJsonObject("user") ?: return@launch
                    val user = Gson().fromJson(json, User::class.java)

                    tvNickname.text = user.nickname
                    myUserId = user.userId
                    hasPhoto = user.photoVersion != null
                    com.example.android_project.util.PhotoLoader.bind(
                        viewLifecycleOwner, requireContext(), ivProfilePhoto, ivProfilePlaceholder, user.userId, user.photoVersion
                    )
                    tvStatCleaning.text = (user.stats?.completedCleanings ?: 0).toString()
                    tvStatHelp.text = (user.stats?.helpedCleanings ?: 0).toString()
                    // 한 계정은 방 하나에만 가입할 수 있어서, 닉네임 아래에 방 이름과 권한을 보여준다.
                    tvRoom.text = user.room?.let { "${it.roomName} · ${it.roleText()}" } ?: "참여 중인 방이 없어요"
                } else if (isAdded) {
                    com.example.android_project.util.Msg.makeText(
                        requireContext(),
                        ApiError.messageOf(response, "내 정보를 불러오지 못했어요."),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            } catch (e: Exception) {
                if (isAdded) {
                    com.example.android_project.util.Msg.makeText(
                        requireContext(),
                        "서버에 연결할 수 없습니다.\n(${e.message})",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }

    // ---------------------------------------------------------------
    // 프로필 사진: 촬영 또는 갤러리 선택 -> 자르기 -> 올리기
    // ---------------------------------------------------------------

    private fun showPhotoMenu() {
        val items = mutableListOf("사진 촬영", "갤러리에서 선택")
        if (hasPhoto) items.add("사진 삭제")
        com.google.android.material.dialog.MaterialAlertDialogBuilder(requireContext())
            .setTitle("프로필 사진")
            .setItems(items.toTypedArray()) { _, which ->
                when (which) {
                    0 -> startCamera()
                    1 -> pickImage.launch(
                        androidx.activity.result.PickVisualMediaRequest(
                            androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia.ImageOnly
                        )
                    )
                    else -> removePhoto()
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun startCamera() {
        if (androidx.core.content.ContextCompat.checkSelfPermission(requireContext(), android.Manifest.permission.CAMERA)
            == android.content.pm.PackageManager.PERMISSION_GRANTED
        ) launchCamera() else cameraPermission.launch(android.Manifest.permission.CAMERA)
    }

    private fun launchCamera() {
        val dir = java.io.File(requireContext().cacheDir, "camera").apply { mkdirs() }
        val file = java.io.File(dir, "capture.jpg")
        cameraFile = file
        val uri = androidx.core.content.FileProvider.getUriForFile(
            requireContext(), "${requireContext().packageName}.fileprovider", file
        )
        takePicture.launch(uri)
    }

    private fun openCrop(uri: android.net.Uri) {
        cropResult.launch(
            Intent(requireContext(), PhotoCropActivity::class.java).putExtra(PhotoCropActivity.EXTRA_URI, uri.toString())
        )
    }

    private fun uploadPhoto(file: java.io.File) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = repo.uploadPhoto(file.readBytes()) ?: return@launch
                if (response.isSuccessful) {
                    com.example.android_project.util.Msg.show(requireContext(), "프로필 사진을 바꿨어요.")
                    load()
                } else {
                    com.example.android_project.util.Msg.show(requireContext(), ApiError.messageOf(response, "사진을 올리지 못했어요."), true)
                }
            } catch (e: Exception) {
                com.example.android_project.util.Msg.show(requireContext(), "서버에 연결할 수 없어요.")
            }
        }
    }

    private fun removePhoto() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = repo.deletePhoto() ?: return@launch
                if (response.isSuccessful) {
                    com.example.android_project.util.Msg.show(requireContext(), "프로필 사진을 지웠어요.")
                    load()
                } else {
                    com.example.android_project.util.Msg.show(requireContext(), ApiError.messageOf(response, "사진을 지우지 못했어요."))
                }
            } catch (e: Exception) {
                com.example.android_project.util.Msg.show(requireContext(), "서버에 연결할 수 없어요.")
            }
        }
    }

    private fun confirmLogout() {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(requireContext())
            .setMessage("로그아웃할까요?")
            .setPositiveButton("로그아웃") { _, _ ->
                TokenManager(requireContext()).clearToken()
                val intent = Intent(requireContext(), LoginActivity::class.java)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                startActivity(intent)
            }
            .setNegativeButton("취소", null)
            .show()
    }
}
