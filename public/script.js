document.addEventListener('DOMContentLoaded', () => {
    const eventsContainer = document.getElementById('events-container');
    const createEventForm = document.getElementById('create-event-form');
    const dateInput = document.getElementById('date'); // Reference to the date input

    // --- Modal Elements (No Change) ---
    const modal = document.getElementById('add-player-modal');
    const closeModalBtn = document.querySelector('.close-button');
    const addPlayerForm = document.getElementById('add-player-form');
    const modalEventId = document.getElementById('modal-event-id');
    const modalTeeTimeId = document.getElementById('modal-teetime-id');
    const modalPlayerName = document.getElementById('playerName');

    // --- Helper Function: Set Minimum Date ---
    const setMinimumDate = () => {
        const now = new Date();
        const year = now.getFullYear();
        // getMonth() is 0-indexed, so add 1
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        
        // Format as YYYY-MM-DD for the HTML 'min' attribute
        const today = `${year}-${month}-${day}`;
        dateInput.min = today;
    };
    
    // --- Main Function to Fetch and Display Events (No change to logic) ---
    const loadEvents = async () => {
        try {
            const response = await fetch('/api/events');
            if (!response.ok) throw new Error('Failed to fetch events.');
            
            const events = await response.json();
            eventsContainer.innerHTML = ''; 

            if (events.length === 0) {
                eventsContainer.innerHTML = '<p>No events scheduled yet.</p>';
                return;
            }

            events.forEach(event => {
                const eventElement = document.createElement('article');
                eventElement.className = 'event-card';
                eventElement.setAttribute('data-event-id', event._id);

                const eventDate = new Date(event.date).toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                });

                let teeTimesHtml = event.teeTimes.map(tt => {
                    let playersHtml = tt.players.map(p => `
                        <li class="player-item">
                            ${p.name}
                            <button class="remove-player" data-player-id="${p._id}" data-teetime-id="${tt._id}">×</button>
                        </li>
                    `).join('');

                    let addPlayerBtn = tt.players.length < 4 ?
                        `<button class="add-player" data-teetime-id="${tt._id}">Add Player +</button>` :
                        `<div class="tee-time-full">Full</div>`;

                    return `
                        <div class="tee-time-slot" data-teetime-id="${tt._id}">
                            <div class="tee-time-header">
                                <strong>${tt.time}</strong>
                                <button class="remove-teetime-btn" data-teetime-id="${tt._id}">−</button>
                            </div>
                            <ul class="player-list">${playersHtml}</ul>
                            ${addPlayerBtn}
                        </div>
                    `;
                }).join('');

                eventElement.innerHTML = `
                    <div class="event-header">
                        <h3>${event.eventName}</h3>
                        <div class="event-actions">
                            <button class="add-teetime-btn" data-event-id="${event._id}">Add Tee Time</button>
                            <button class="edit-event-btn" data-event-id="${event._id}" data-event-name="${event.eventName}" data-course="${event.course}">Edit Event</button>
                            <button class="delete-event-btn" data-event-id="${event._id}">Delete Event</button>
                        </div>
                    </div>
                    <p class="event-details">${event.course} | ${eventDate}</p>
                    <div class="tee-time-container">${teeTimesHtml}</div>
                `;
                eventsContainer.appendChild(eventElement);
            });

        } catch (error) {
            console.error('Error loading events:', error);
            eventsContainer.innerHTML = '<p>Error loading events. Please try again.</p>';
        }
    };

    // --- Event Handlers ---

    // 1. Create Event Form (*** FRONTEND VALIDATION ADDED HERE ***)
    createEventForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        
        const eventData = {
            eventName: document.getElementById('eventName').value,
            course: document.getElementById('course').value,
            date: document.getElementById('date').value,
            startTime: document.getElementById('startTime').value,
            numTeeTimes: document.getElementById('numTeeTimes').value
        };

        // --- NEW: Frontend Date/Time Validation ---
        const eventDateTime = new Date(`${eventData.date}T${eventData.startTime}`);
        const now = new Date();
        
        // Subtract a minute buffer for time zone safety
        now.setMinutes(now.getMinutes() - 1); 

        if (eventDateTime < now) {
            alert('Error: Events must be scheduled in the future! Please check the date and time.');
            return; 
        }
        // --- END NEW VALIDATION ---
        
        try {
            const response = await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });

            if (!response.ok) {
                const errData = await response.json();
                // Display specific backend validation error if it exists
                throw new Error(errData.message || 'Failed to create event.');
            }

            createEventForm.reset(); 
            loadEvents(); 
        } catch (error) {
            console.error('Error creating event:', error);
            alert(`Error: ${error.message}`);
        }
    });

    // 2. Click Handling (No change)
    eventsContainer.addEventListener('click', (e) => {
        const eventCard = e.target.closest('.event-card');
        if (!eventCard) return;
        
        const eventId = eventCard.dataset.eventId;

        if (e.target.classList.contains('add-player')) {
            const teeTimeId = e.target.dataset.teetimeId;
            openAddPlayerModal(eventId, teeTimeId);
        }

        if (e.target.classList.contains('remove-player')) {
            const teeTimeId = e.target.dataset.teetimeId;
            const playerId = e.target.dataset.playerId;
            
            if (confirm('Are you sure you want to remove this player?')) {
                removePlayer(eventId, teeTimeId, playerId);
            }
        }
        
        if (e.target.classList.contains('delete-event-btn')) {
            if (confirm(`Are you sure you want to permanently delete event: ${eventId}?`)) {
                deleteEvent(eventId);
            }
        }

        if (e.target.classList.contains('edit-event-btn')) {
            const eventName = e.target.dataset.eventName;
            const course = e.target.dataset.course;
            editEventPrompt(eventId, eventName, course);
        }
        
        if (e.target.classList.contains('add-teetime-btn')) {
            addTeeTimePrompt(eventId);
        }

        if (e.target.classList.contains('remove-teetime-btn')) {
            const teeTimeId = e.target.dataset.teetimeId;
            if (confirm('Are you sure you want to permanently remove this tee time? All players will be deleted too!')) {
                removeTeeTime(eventId, teeTimeId);
            }
        }
    });

    // 3. Add Player Modal Form (No Change)
    addPlayerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const eventId = modalEventId.value;
        const teeTimeId = modalTeeTimeId.value;
        const playerName = modalPlayerName.value.trim();

        if (!playerName) return;

        try {
            const response = await fetch(`/api/events/${eventId}/teetimes/${teeTimeId}/add`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerName })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to add player.');
            }

            closeModal();
            loadEvents();
        } catch (error) {
            console.error('Error adding player:', error);
            alert(`Error: ${error.message}`);
        }
    });


    // --- Other API Call/Helper Functions (No Change) ---
    
    // Tee Time Functions (Add/Remove)
    const addTeeTimePrompt = (eventId) => {
        const timeInput = prompt("Enter the new Tee Time (e.g., 04:30 PM):");
        if (!timeInput) return;

        if (!/\d{1,2}:\d{2}\s?(AM|PM)/i.test(timeInput.trim())) {
             alert("Please enter a valid time format (e.g., 04:30 PM).");
             return;
        }

        addTeeTime(eventId, timeInput.trim());
    };

    const addTeeTime = async (eventId, time) => {
        try {
            const response = await fetch(`/api/events/${eventId}/teetimes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ time })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to add tee time.');
            }
            
            alert(`Tee time ${time} successfully added!`);
            loadEvents(); 
        } catch (error) {
            console.error('Error adding tee time:', error);
            alert(`Error: ${error.message}`);
        }
    };
    
    const removeTeeTime = async (eventId, teeTimeId) => {
        try {
            const response = await fetch(`/api/events/${eventId}/teetimes/${teeTimeId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to remove tee time.');
            }
            
            alert('Tee time successfully removed!');
            loadEvents(); 
        } catch (error) {
            console.error('Error removing tee time:', error);
            alert(`Error: ${error.message}`);
        }
    };

    // Player Functions
    const removePlayer = async (eventId, teeTimeId, playerId) => {
        try {
            const response = await fetch(`/api/events/${eventId}/teetimes/${teeTimeId}/players/${playerId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to remove player.');
            }
            loadEvents(); 
        } catch (error) {
            console.error('Error removing player:', error);
            alert(`Error: ${error.message}`);
        }
    };
    
    // Event Functions
    const deleteEvent = async (eventId) => {
        try {
            const response = await fetch(`/api/events/${eventId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to delete event.');
            }
            alert('Event successfully deleted!');
            loadEvents(); 
        } catch (error) {
            console.error('Error deleting event:', error);
            alert(`Error: ${error.message}`);
        }
    };

    const editEventPrompt = (eventId, currentName, currentCourse) => {
        const newName = prompt(`Enter new Event Name (or leave blank for '${currentName}'):`, currentName);
        if (newName === null) return; 

        const newCourse = prompt(`Enter new Course Name (or leave blank for '${currentCourse}'):`, currentCourse);
        if (newCourse === null) return;
        
        const updateData = {};
        if (newName.trim() !== currentName) updateData.eventName = newName.trim();
        if (newCourse.trim() !== currentCourse) updateData.course = newCourse.trim();

        if (Object.keys(updateData).length === 0) {
            alert("No changes were made.");
            return;
        }

        updateEvent(eventId, updateData);
    };

    const updateEvent = async (eventId, updateData) => {
        try {
            const response = await fetch(`/api/events/${eventId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to update event.');
            }
            
            alert('Event successfully updated!');
            loadEvents(); 
        } catch (error) {
            console.error('Error updating event:', error);
            alert(`Error: ${error.message}`);
        }
    };


    // Modal Helper Functions
    const openAddPlayerModal = (eventId, teeTimeId) => {
        modalEventId.value = eventId;
        modalTeeTimeId.value = teeTimeId;
        modalPlayerName.value = '';
        modal.style.display = 'block';
        modalPlayerName.focus();
    };

    const closeModal = () => {
        modal.style.display = 'none';
    };

    closeModalBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

	// Add these new references at the top of your script.js file (near the other elements)
const subscribeForm = document.getElementById('subscribe-form');
const subscribeEmailInput = document.getElementById('subscribeEmail');
const subscriptionMessage = document.getElementById('subscription-message');


// Add this entire new event listener block:
subscribeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = subscribeEmailInput.value.trim();

    try {
        const response = await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            // Display the specific error message from the backend
            throw new Error(data.message || 'Failed to subscribe.');
        }

        subscriptionMessage.style.color = 'green';
        subscriptionMessage.textContent = 'Success! You are now subscribed.';
        subscribeForm.reset();
    } catch (error) {
        console.error('Subscription error:', error);
        subscriptionMessage.style.color = 'red';
        subscriptionMessage.textContent = `Error: ${error.message}`;
    }
});

    // --- Initial Load ---
    setMinimumDate();
    loadEvents();
});