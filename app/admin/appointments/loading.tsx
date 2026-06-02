export default function AppointmentsLoading() {
  return <>
    <div className="workflowGrid">
      <div className="workflowCard"><strong>Clients</strong><span>Client records</span></div>
      <div className="workflowCard active"><strong>Appointments</strong><span>Bookings</span></div>
      <div className="workflowCard"><strong>Cases</strong><span>Case files</span></div>
    </div>

    <section className="panel tableWrap appointmentPanel">
      <div className="tableControlBar">
        <span className="skeletonLine wide" />
        <span className="skeletonInput" />
      </div>
      <table className="table dataTable appointmentLegacyTable loadingTable">
        <thead>
          <tr>
            <th>Client<br />Photo</th>
            <th>ID</th>
            <th>Client Name</th>
            <th>Phone</th>
            <th>Appointment Date<br />&amp; Time</th>
            <th>Fee</th>
            <th>Status</th>
            <th>Category</th>
            <th>Actions</th>
            <th>Start Case</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 10 }).map((_, index) => (
            <tr key={index}>
              {Array.from({ length: 10 }).map((__, cell) => (
                <td key={cell}><span className={cell === 0 ? "skeletonAvatar" : "skeletonLine"} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </>;
}
