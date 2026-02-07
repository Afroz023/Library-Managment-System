$(function () {
  $("#btnLogin").on("click", function () {

    let enteredUserName = $("#txtName").val();
    let enteredPassword = $("#txtPwd").val();

    $.ajax({
      method: "GET",
      url: "http://127.0.0.1:2200/getadmin",
      success: function (data) {
        if (
          data.Name === enteredUserName &&
          data.Password === enteredPassword
        ) {
          alert("Login successful");
        } else {
          alert("Invalid username or password");
        }
      },
      error: function () {
        alert("Server error");
      }
    });

  });
});
