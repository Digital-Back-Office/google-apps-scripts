var calendarId = <your-calendar-id>;

// Function to book slot in Calender
function doPost(e) {
  try {
    var calendar = CalendarApp.getCalendarById(calendarId);

    if (!calendar) {
      return sendJsonResponse({ status: "error", message: "Calendar not found." });
    }

    var formData = e.parameter;
    var name = formData["entry.1291198894"] || "Unknown";
    var email = formData["entry.59580764"] || "No email provided";
    var phone = formData["entry.1798038289"] || "No phone provided";
    var dateStr = formData["entry.800910305"]; // "2025-02-27"
    var timeSlot = formData["entry.1284317816"]; // "09:00 AM - 09:30 AM"
    var scheduledBy = formData["ScheduledBy"] || "Digital Back Office"
    var startTime = new Date(formData["StartTime"])
    var endTime = new Date(formData["EndTime"])

    if (!dateStr || !timeSlot) {
      return sendJsonResponse({ status: "error", message: "Invalid date or time slot" });
    }

    var events = calendar.getEvents(startTime,endTime);
    if (events.length > 0) {

      events.map((e)=>{
        console.log(e.getStartTime())
        console.log(e.getEndTime())
      })

      return sendJsonResponse({ status: "error", message: "Time slot is already booked. Please choose another time." });
    }

    var eventName = scheduledBy === "Digital Back Office team" ? "DBO Call" : "Dataflow Demo";

    var event = calendar.createEvent(
      eventName + " with " + name,
      startTime,
      endTime,
      {
        description: "Scheduled by: "+ scheduledBy + "\nEmail: " + email + "\nPhone: " + phone,
        guests: email, 
        sendInvites: true 
      }
    );

    return sendJsonResponse({ status: "success", message: "Event created", eventId: event.getId() });

  } catch (error) {
    return sendJsonResponse({ status: "error", message: error.message });
  }
}

// Function to test the doPost function
function testDoPost() {
  var testEventData = {
    "parameter": {
      "entry.1291198894": "Test User",
      "entry.59580764": "testuser@example.com",
      "entry.1798038289": "1234567890",
      "entry.800910305": "2025-03-06", 
      "entry.1284317816": "10:00 PM - 10:30 PM" ,
      "ScheduledBy" : "Dataflow team"
    }

  };

  var response = doPost(testEventData);
  Logger.log(response.getContent()); // Logs the response to the execution logs
}

// Function to fetch available slots in Calender
function doGet(e) {
  try {
    var dateString = e.parameter.date;
    var timeZone = e.parameter.timezone;

    if (!dateString) {
      return sendJsonResponse({ status: "error", message: "Date Not Found" });
    }
    if(!timeZone){
      return sendJsonResponse({ status: "error", message: "Timezone Not Found" })
    }

    var date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return sendJsonResponse({ status: "error", message: "Invalid Date Format" });
    }
    
    var calendar = CalendarApp.getCalendarById(calendarId);

    if (!calendar) {
      return sendJsonResponse({ status: "error", message: "Calendar not found." });
    }

    var events = calendar.getEventsForDay(date);
    console.log("Events: "+events)

    // Convert events to an array of booked time ranges
    var bookedSlots = events.map(event => ({
      start: event.getStartTime(),
      end: event.getEndTime()
    }));

    console.log(bookedSlots)

    // Generate available 30-minute slots
    var availableSlots = generateAvailableSlots(date,timeZone, bookedSlots);

    // console.log(availableSlots)
    return sendJsonResponse({ status: "success", availableSlots: availableSlots ,date: date});

  } catch (error) { 
    console.log(error)
    return sendJsonResponse({ status: "error", message: error.message });
  }
}

// Function to generate available 30-minute time slots
function generateAvailableSlots(date, clientTimeZone,bookedSlots) {
  try {
    var slots = [];
    var now = new Date();
    var londonTimeZone = "Europe/London";

    // Convert the start and end time of working hours in London time zone
    var startTime = new Date(date);
    startTime.setHours(9, 0, 0, 0);

    var endTime = new Date(date);
    endTime.setHours(19, 0, 0, 0);

    // Convert start and end time to client time zone
    var clientStartTime = convertToTZ(new Date(startTime), clientTimeZone);
    var clientEndTime = convertToTZ(new Date(endTime), clientTimeZone);

    // Get current time in client time zone
    var currentTimeInClientTZ = convertToTZ(now, clientTimeZone);

    // Get current time in London time zone
    var currentTimeInLondonTZ = convertToTZ(now, londonTimeZone);

    // If the booking is for today, ensure the first slot is at least 3 hours from now
    if (startTime.toDateString() === currentTimeInLondonTZ.toDateString()) {
      var minStartTime = new Date(currentTimeInClientTZ);
      minStartTime.setHours(minStartTime.getHours() + 3);
      minStartTime.setMinutes(Math.ceil(minStartTime.getMinutes() / 30) * 30, 0, 0);
      
      clientStartTime = new Date(Math.max(clientStartTime, minStartTime));
      
      var minStartTimeInLondon = new Date(currentTimeInLondonTZ);
      minStartTimeInLondon.setHours(minStartTimeInLondon.getHours() + 3);
      minStartTimeInLondon.setMinutes(Math.ceil(minStartTimeInLondon.getMinutes() / 30) * 30, 0, 0);
      
      startTime = new Date(Math.max(startTime, minStartTimeInLondon));
    }

    // Convert bookedSlots to London time
    bookedSlots = bookedSlots.map(slot => ({
      start: convertToTZ(slot.start, londonTimeZone),
      end: convertToTZ(slot.end, londonTimeZone)
    }));

    // Generate slots and check for conflicts in London timezone
    while (startTime < endTime) {
      var slotStart = new Date(startTime);
      var slotEnd = new Date(startTime);
      slotEnd.setMinutes(slotEnd.getMinutes() + 30);

      var isConflicting = bookedSlots.some(event => (slotStart < event.end && slotEnd > event.start));

      if (!isConflicting) {
        // Convert to client time zone before storing
        let clientSlotStart = convertToTZ(slotStart, clientTimeZone);
        let clientSlotEnd = convertToTZ(slotEnd, clientTimeZone);
        slots.push(formatTime(clientSlotStart) + " - " + formatTime(clientSlotEnd));
      }

      startTime.setMinutes(startTime.getMinutes() + 30);
    }

    console.log(slots)
    return slots;
  } catch (e) {
    console.error(e);
    return [];
  }
}

// Function to convert to desired TimeZone
function convertToTZ(date,toTimeZone){
  try{

    return new Date(new Intl.DateTimeFormat('en-US', {
        timeZone: toTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date(date)));
  }catch(e){
    console.log(e)
    // return e
  }
}

// Function to send Responses as JSON
function sendJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Function to format time to "hh:mm AM/PM"
function formatTime(date) {
  try{
    var date = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return date
  } catch(e){
    return "here" + e
  }
}