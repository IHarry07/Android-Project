package com.example.android_project.ui.main

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import com.example.android_project.R
import com.example.android_project.ui.LoginActivity
import com.example.android_project.util.TokenManager

// 아직 만들지 않은 탭의 임시 화면. 프로필 탭에는 로그아웃 버튼만 둔다.
class PlaceholderFragment : Fragment() {

    companion object {
        private const val ARG_TITLE = "title"
        private const val ARG_LOGOUT = "logout"

        fun newInstance(title: String, showLogout: Boolean = false) =
            PlaceholderFragment().apply {
                arguments = Bundle().apply {
                    putString(ARG_TITLE, title)
                    putBoolean(ARG_LOGOUT, showLogout)
                }
            }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_placeholder, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        view.findViewById<TextView>(R.id.tvPlaceholderTitle).text =
            arguments?.getString(ARG_TITLE).orEmpty()

        if (arguments?.getBoolean(ARG_LOGOUT) == true) {
            val btnLogout = view.findViewById<Button>(R.id.btnLogout)
            btnLogout.visibility = View.VISIBLE
            btnLogout.setOnClickListener { confirmLogout() }
        }
    }

    private fun confirmLogout() {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(requireContext())
            .setMessage("로그아웃할까요?")
            .setPositiveButton("로그아웃") { _, _ ->
                // 서버에서도 이 로그인을 바로 무효화한다.
                com.example.android_project.util.Session.logout(requireContext())
            }
            .setNegativeButton("취소", null)
            .show()
    }
}
