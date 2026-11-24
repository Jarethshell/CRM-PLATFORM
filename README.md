# CCS ProCRM Simulator

An offline-first bilingual AI mock-call simulator and contact-center CRM platform for Grade 11–12 Contact Center Services (CCS) students, teachers, and school administrators.

CCS ProCRM recreates a practical BPO workstation in the browser. Students can practice customer calls, record CRM information, measure their performance, and receive teacher feedback. Teachers can review submissions and export research-ready results, while administrators can manage accounts, email settings, and semester data.

## What the Website Can Do

### Student Agent Portal

- Practice realistic customer-service calls in English or Filipino (Tagalog).
- Choose from four scenarios:
  - Telco Fiber Internet Outage
  - Mobile Plan Overcharge Dispute
  - Missing E-Commerce Parcel Refund
  - Online Banking Password Lockout
- Chat with an AI customer during a simulated call.
- Use text input, browser speech-to-text, and AI text-to-speech when supported by the device.
- Record microphone audio during a mock call.
- Track live call metrics:
  - Average Handle Time (AHT)
  - Typing pace in words per minute (WPM)
  - Empathy score
  - Script adherence
  - Hold time
  - Dead-air events
- Complete a CRM ticket with the customer name, account or order number, issue category, disposition, and resolution notes.
- Review automated strengths and improvement suggestions after a call.
- Take a BPO typing-speed and accuracy practice test with ten standard call-center spiels.
- Test the microphone level, speech recognition, and speaker output.
- View call history and search previous CRM records.
- Continue working offline; unsynced calls are stored locally and uploaded when the connection returns.
- View teacher grades, feedback, and downloadable PDF performance reports.

### Teacher / Evaluator Dashboard

- View all student mock-call submissions in one queue.
- Search by student, email, or scenario.
- Filter submissions by pending or graded status.
- Review the student’s CRM ticket, transcript, recorded audio, and automated QA results.
- Grade each call using a 100-point rubric:
  - Communication and Fluency: 0–25
  - Empathy and Tone: 0–25
  - CRM Accuracy: 0–25
  - Problem Resolution: 0–25
- Add written feedback for each student.
- Generate and download an official A4 PDF performance report.
- Email the report to the student through configured Gmail SMTP.
- View class totals, pending grades, class average, and registered students.
- Manage the student directory and remove obsolete records.
- Export call and grading data as CSV for Excel, Google Sheets, SPSS, or other research tools.

### Platform Admin Dashboard

- View and manage teacher accounts.
- View and manage student accounts.
- Configure Gmail SMTP using a Google App Password.
- Send a test email to verify report delivery.
- Perform end-of-semester cleanup:
  - Clear call submissions while keeping accounts.
  - Remove students and calls while keeping teachers.
  - Perform a full account and call-data reset.

## Main Benefits

- **BPO-focused practice:** Builds call handling, empathy, communication, typing, and CRM documentation skills.
- **Bilingual learning:** Supports both English and Filipino customer interactions.
- **Measurable performance:** Combines automatic call metrics with teacher evaluation.
- **Offline-first operation:** Students can practice in classrooms with unreliable internet access.
- **Research-ready data:** Exports quantitative call and grading data for capstone analysis.
- **Flexible deployment:** Runs in a browser, across a local Wi-Fi network, or as a Windows desktop application.
- **Role-based access:** Separates student, teacher, and administrator workflows.

## Technology Stack

- HTML, CSS, and vanilla JavaScript
- Node.js and Express
- Local JSON database storage
- IndexedDB for offline call records
- Progressive Web App service worker
- Web Speech API and Web Audio API
- PDFKit for PDF report generation
- Nodemailer for Gmail SMTP delivery
- Electron and electron-builder for desktop packaging

## Requirements

- Node.js 18 or newer recommended
- npm
- A modern browser such as Chrome or Edge for microphone and speech features
- Microphone permission for voice recording and diagnostics

## Run the Web Version

1. Clone or download this repository.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the server:

   ```bash
   npm start
   ```

4. Open the platform:

   ```text
   http://localhost:3000
   ```

The application stores its local database in `database.json`. Keep this file private when it contains real student records.

## Run the Desktop Version

To open the Electron desktop application:

```bash
npm run electron
```

To build a Windows installer:

```bash
npm run build-win
```

The generated installer is placed in the `dist/` directory.

## Local Network Demonstration

To let students or panelists use the platform from another device:

1. Connect the devices to the same Wi-Fi network or mobile hotspot.
2. Start the server with `npm start`.
3. Find the host computer’s local IP address.
4. Open this address on the other device:

   ```text
   http://YOUR_LOCAL_IP:3000
   ```

Example:

```text
http://192.168.43.15:3000
```

## Account Roles

| Role | Purpose |
| --- | --- |
| Student | Practice calls, complete diagnostics, submit CRM records, and view feedback |
| Teacher | Review calls, grade students, send reports, and export research data |
| Admin | Manage users, configure email, and perform semester cleanup |

Teachers require the configured faculty passkey when creating an account. Students can register with their name, email, section, and password.

## Gmail Report Delivery

The Admin dashboard can send PDF reports through Gmail SMTP. Gmail requires a Google App Password when two-step verification is enabled. Do not commit Gmail passwords, app passwords, or private student information to GitHub.

## Suggested Demonstration Flow

1. Register or sign in as a student.
2. Run the typing and microphone diagnostics.
3. Start an English or Filipino mock call.
4. Complete the conversation and CRM ticket.
5. End the call and review the automatic metrics.
6. Sign in as a teacher and open the submission.
7. Review the audio, transcript, and CRM data.
8. Assign the rubric score and download the PDF report.
9. Export the class data as CSV.

## Project Structure

```text
public/
├── index.html                 # Login and registration
├── student-dashboard.html     # Student practice portal
├── teacher-dashboard.html     # Teacher review and grading portal
├── admin-dashboard.html       # Admin management portal
├── js/                        # Authentication, dashboards, AI, and offline sync
├── css/                       # Shared application styles
└── sw.js                      # Service worker for offline support

server.js                      # Express API and report generation
electron-main.js               # Electron desktop entry point
database.json                  # Local application data
package.json                   # Scripts and dependencies
```

## Academic and Privacy Notice

This project is intended for educational practice, classroom demonstrations, and capstone research data gathering. Replace sample credentials before deployment, use test data during public demonstrations, and protect student records and email credentials.

## License

This project is an academic capstone platform. Add the project’s final license and author information before publishing the repository publicly.
