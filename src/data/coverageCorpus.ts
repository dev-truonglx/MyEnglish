/**
 * Short, original texts typical of a developer's working day. Used to show the learner
 * "Bạn hiểu ~X% số từ trong một tài liệu IT thường gặp" by checking which of their words they know.
 * Plain prose only: no code, URLs or symbols, few proper names, mostly A1–B1 vocabulary plus common
 * technical words.
 */

export interface CoverageText {
  id: string;
  title: string;
  text: string;
}

export const COVERAGE_TEXTS: CoverageText[] = [
  {
    id: "readme",
    title: "README: bắt đầu",
    text:
      "Getting started. This guide will help you run the project on your own computer in a few minutes. " +
      "First, install the tools listed in the requirements file. You will also need Git and a code editor. " +
      "Clone the repository to your machine and open the project folder. Then install the dependencies with " +
      "the package manager. This can take a few minutes the first time. Next, copy the example settings file " +
      "and give it a new name. Open the new file and add your own database password and port number. Do not " +
      "share this file or push it to the main branch. When everything is ready, start the development server. " +
      "Open your browser and go to the local address shown in the terminal. You should see the home page. If " +
      "you see an error, check that the database is running and that your settings are correct. To run the " +
      "tests, use the test command. All tests should pass before you open a pull request. If you have " +
      "questions, ask in the team chat or create an issue. We are always happy to help new contributors.",
  },
  {
    id: "bug-report",
    title: "Báo cáo lỗi",
    text:
      "Title. The app crashes when a user uploads a large image. Description. When I upload a profile picture " +
      "that is bigger than 10 megabytes, the app stops working and shows a white screen. Smaller images work " +
      "fine. Steps to reproduce. First, log in with a test account. Then open the profile page and click the " +
      "upload button. Choose an image larger than 10 megabytes and wait a few seconds. Expected result. The " +
      "app should show a message that says the file is too large. Actual result. The screen turns white and " +
      "nothing happens. After I refresh the page, I am logged out. Environment. I tested this on version 3.2 " +
      "of the app, in two different browsers on my laptop. The same problem happens on my phone. Notes. I " +
      "checked the server logs and found a timeout error at the same time. I think the request takes too long " +
      "and the server closes the connection. This bug is blocking two customers, so the priority should be " +
      "high. I can help test the fix.",
  },
  {
    id: "standup",
    title: "Ghi chú họp standup hằng ngày",
    text:
      "Daily standup, Tuesday. Yesterday I finished the login page and fixed two small bugs in the search " +
      "feature. I also reviewed a pull request from a teammate and left a few comments. The changes look " +
      "good, but we still need more tests. Today I will start working on the password reset flow. First I " +
      "need to talk with the designer, because the screens are not ready yet. After that, I will write the " +
      "backend endpoint and connect it to the email service. If I have time, I will update the documentation " +
      "for the login page. Blockers. I do not have access to the staging server, so I cannot test my changes " +
      "there. Could someone from the operations team give me access this morning? Also, the build on the " +
      "main branch has been slow since last week. It now takes about twenty minutes. I think we should look " +
      "at this together after the sprint meeting. That is all from me. Thanks, everyone.",
  },
  {
    id: "delay-email",
    title: "Email báo trễ hạn cho quản lý",
    text:
      "Subject. Update on the payment feature. Hi, I am writing to let you know that the payment feature will " +
      "not be ready by Friday as we planned. I am sorry for the delay. On Monday we found a problem with the " +
      "payment provider. Their test system was down for almost two days, so we could not check our changes. " +
      "We also found that some old orders use a different format, and we need to handle them carefully. We " +
      "do not want to release something that may charge customers twice. My new estimate is next Wednesday. " +
      "The main work is done. We only need to finish the tests and fix a few small issues. Another developer " +
      "from my team will help me with the testing, so I think this date is realistic. If the deadline cannot " +
      "change, we could release a smaller version on Friday without refunds, and add refunds next week. " +
      "Please let me know which option you prefer. I am happy to discuss this in a short call today. Best " +
      "regards.",
  },
  {
    id: "api-docs",
    title: "Tài liệu API ngắn",
    text:
      "Users API. This page explains how to get, create and update users. Every request must include your " +
      "access token in the header. If the token is missing or has expired, the server returns an error with " +
      "status code 401. Get a list of users. Send a request to the users endpoint to get a list of users. The " +
      "response contains up to 50 users per page. To see the next page, add the page number to your request. " +
      "You can also filter users by name or email. Create a user. To create a new user, send the name, " +
      "email and role in the request body. The email must be unique. If the email already exists, the server " +
      "returns a conflict error. When the user is created, the response includes the id of the new user. " +
      "Update a user. You can change the name or the role of a user at any time, but you cannot change the " +
      "email. Only admins can update other users. Limits. Each account can send up to 100 requests per " +
      "minute. If you send more, you will get an error and must wait before you try again. Please cache the " +
      "results when possible.",
  },
  {
    id: "code-review",
    title: "Bình luận review code",
    text:
      "Comment from the reviewer. Thanks for this change, it looks much cleaner now. I have a few small " +
      "questions. In the main function, why do we load all the users before we check the filter? This could " +
      "be slow when the database is large. Maybe we can filter first and then load only the users we need. " +
      "Reply from the author. Good point. I did it this way because the old code did the same, but I agree " +
      "it is not efficient. I will move the filter into the query. Comment from the reviewer. Also, the " +
      "function name is a bit confusing. It says get users, but it also sends emails. Could you split it " +
      "into two functions? Reply from the author. Sure, I will split it and add a short comment. Should I " +
      "also add tests for the email part? Comment from the reviewer. Yes, please. One or two simple tests " +
      "are enough. After that, I think we can merge it. Reply from the author. Done. I pushed the changes to " +
      "the branch and all tests pass now. Comment from the reviewer. Looks good to me. Approved.",
  },
];
