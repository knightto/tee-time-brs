document.addEventListener('DOMContentLoaded', () => {
    const eventsContainer = document.getElementById('events-container');
    const createEventForm = document.getElementById('create-event-form');

    // --- Add Player Modal Elements ---
    const modal = document.getElementById('add-player-modal');
    const closeModalBtn = document.querySelector('.close-button'); // Targets the close button on the add player modal
    const addPlayerForm = document.getElementById('add-player-form');
    const modalEventId = document.getElementById('modal-event-id');
    const modalTeeTimeId = document.getElementById('modal-teetime-id');
    const modalPlayerName = document.getElementById('playerName');

    // --- ⭐ NEW: Edit Event Modal Elements ---
    const editModal = document.getElementById('edit-event-modal');
    // Note: Using a specific class selector for the close button to avoid conflicts
    const closeEditModalBtn = document.querySelector('.edit-close-button'); 
    const editEventForm = document.getElementById('edit-event-form');
    const editModalEventId = document.getElementById('edit-modal-event-id');
    const editEventNameInput = document.getElementById('editEventName');
    const editCourseInput = document.getElementById('editCourse');
    const editDateInput = document.getElementById('editDate');
    const editAdminCodeInput = document.getElementById('editAdminCode');


    // --- Subscription Elements ---
    const subscribeForm = document.getElementById('subscribe-form');
    const subscriptionMessage = document.getElementById('subscription-message');


    // Helper function to format date for input[type="date"]
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toISOString().split('T')[0];
    };

    // --- Main Function to Fetch and Display Events ---
    const loadEvents = async () => {
        try {
            const response = await fetch('/api/events');
            if (!response.ok) throw new Error('Failed to fetch events.');
            
            const events = await response.json();
            eventsContainer.innerHTML = ''; // Clear existing content

            if (events.length === 0) {
                eventsContainer.innerHTML = '<p>No events scheduled yet.</p>';
                return;
            }

            events.forEach(event => {
                const eventDiv = document.createElement('div');
                eventDiv.className = 'event-card';
                eventDiv.dataset.eventId = event._id;

                const eventDate = new Date(event.date).toLocaleDateString('en-US', { 
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
                });

                // Display Event Details and Admin Controls
                eventDiv.innerHTML = `
                    <h3>${event.eventName} at ${event.course}</h3>
                    <p>Date: <strong>${eventDate}</strong></p>
                    <div class="admin-controls">
                        <button class="add-tee-time-btn" data-event-id="${event._id}">+ Tee Time</button>
                        <button class="delete-event-btn" data-event-id="${event._id}">Delete Event</button>
                        <button class="edit-event-btn" data-event-id="${event._id}" data-event='${JSON.stringify(event)}'>Edit Event</button>
                    </div>
                    <div class="tee-times-list">
                        ${event.teeTimes.map(teeTime => `
                            <div class="tee-time" data-teetime-id="${teeTime._id}">
                                <h4>${teeTime.time}</h4>
                                <div class="players-list">
                                    ${teeTime.players.map(player => `
                                        <div class="player">
                                            <span>${player.name}</span>
                                            <button class="remove-player-btn" 
                                                data-event-id="${event._id}" 
                                                data-teetime-id="${teeTime._id}" 
                                                data-player-id="${player._id}">X</button>
                                        </div>
                                    `).join('')}
                                </div>
                                ${teeTime.players.length < 4 
                                    ? `<button class="add-player-open-btn" data-event-id="${event._id}" data-teetime-id="${teeTime._id}">Sign Up</button>`
                                    : `<div class="tee-time-full">FULL</div>`
                                }
                                <button class="remove-tee-time-btn" data-event-id="${event._id}" data-teetime-id="${teeTime._id}">Remove Tee Time</button>
                            </div>
                        `).join('')}
                    </div>
                `;

                eventsContainer.appendChild(eventDiv);
            });

            // Re-attach all dynamic listeners after DOM update
            attachEventListeners();

        } catch (error) {
            console.error('Error loading events:', error);
            eventsContainer.innerHTML = `<p>Error loading events: ${error.message}</p>`;
        }
    };

    // --- Event Listener Attachment ---
    // This is necessary because new buttons are created every time loadEvents runs
    const attachEventListeners = () => {
        
        // Add Player Buttons
        document.querySelectorAll('.add-player-open-btn').forEach(button => {
            button.onclick = (e) => openAddPlayerModal(e.target.dataset.eventId, e.target.dataset.teetimeId);
        });

        // Remove Player Buttons
        document.querySelectorAll('.remove-player-btn').forEach(button => {
            button.onclick = (e) => removePlayer(e.target.dataset.eventId, e.target.dataset.teetimeId, e.target.dataset.playerId);
        });

        // Add Tee Time Buttons
        document.querySelectorAll('.add-tee-time-btn').forEach(button => {
            button.onclick = (e) => {
                const time = prompt('Enter the new tee time (e.g., 10:30 AM):');
                if (time) addTeeTime(e.target.dataset.eventId, time);
            };
        });

        // Remove Tee Time Buttons
        document.querySelectorAll('.remove-tee-time-btn').forEach(button => {
            button.onclick = (e) => {
                const deleteCode = prompt('Enter the Admin Code to remove this tee time:');
                if (deleteCode) removeTeeTime(e.target.dataset.eventId, e.target.dataset.teetimeId, deleteCode);
            };
        });

        // Delete Event Buttons
        document.querySelectorAll('.delete-event-btn').forEach(button => {
            button.onclick = (e) => {
                const deleteCode = prompt('Enter the Admin Code to delete the entire event:');
                if (deleteCode) deleteEvent(e.target.dataset.eventId, deleteCode);
            };
        });

        // ⭐ NEW: Edit Event Buttons
        document.querySelectorAll('.edit-event-btn').forEach(button => {
            // Note: We parse the event data from the button's data attribute
            button.onclick = (e) => openEditModal(JSON.parse(e.target.dataset.event));
        });
    };

    // --- MODAL FUNCTIONS ---

    // Add Player Modal
    const openAddPlayerModal = (eventId, teeTimeId) => {
        modalEventId.value = eventId;
        modalTeeTimeId.value = teeTimeId;
        modal.style.display = 'flex';
    };

    closeModalBtn.onclick = () => {
        modal.style.display = 'none';
        addPlayerForm.reset();
    };
    // Close modal if user clicks outside of it
    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
            addPlayerForm.reset();
        }
    };
    
    // ⭐ NEW: Edit Event Modal
    const openEditModal = (event) => {
        editModalEventId.value = event._id;
        editEventNameInput.value = event.eventName;
        editCourseInput.value = event.course;
        // Format the date for the HTML date input
        editDateInput.value = formatDate(event.date); 
        editAdminCodeInput.value = ''; // Clear code for security
        editModal.style.display = 'flex';
    };

    closeEditModalBtn.onclick = () => {
        editModal.style.display = 'none';
        editEventForm.reset();
    };
    // Close modal if user clicks outside of it
    window.onclick = (event) => {
        // Need to check both modals
        if (event.target === editModal) {
            editModal.style.display = 'none';
            editEventForm.reset();
        } else if (event.target === modal) {
            modal.style.display = 'none';
            addPlayerForm.reset();
        }
    };


    // --- FORM SUBMISSIONS ---

    // Create New Event
    createEventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const eventData = {
            eventName: document.getElementById('eventName').value,
            course: document.getElementById('course').value,
            date: document.getElementById('date').value,
            startTime: document.getElementById('startTime').value,
            numTeeTimes: parseInt(document.getElementById('numTeeTimes').value, 10)
        };

        try {
            const response = await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to create event.');
            }

            createEventForm.reset();
            loadEvents();
            alert('Event created successfully and notifications sent (if subscribed)!');
        } catch (error) {
            console.error('Error creating event:', error);
            alert(`Error creating event: ${error.message}`);
        }
    });

    // Add Player
    addPlayerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const eventId = modalEventId.value;
        const teeTimeId = modalTeeTimeId.value;
        const playerName = modalPlayerName.value;

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
            
            modal.style.display = 'none';
            addPlayerForm.reset();
            loadEvents();
        } catch (error) {
            console.error('Error adding player:', error);
            alert(`Error: ${error.message}`);
        }
    });

    // ⭐ NEW: Edit Event Submission
    editEventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const eventId = editModalEventId.value;
        const updateData = {
            eventName: editEventNameInput.value,
            course: editCourseInput.value,
            date: editDateInput.value,
            deleteCode: editAdminCodeInput.value, // Used as 'deleteCode' for authorization
        };

        try {
            const response = await fetch(`/api/events/${eventId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to update event.');
            }
            
            editModal.style.display = 'none';
            editEventForm.reset();
            loadEvents();
            alert('Event updated successfully!');
        } catch (error) {
            console.error('Error updating event:', error);
            alert(`Error updating event: ${error.message}`);
        }
    });


    // Subscribe to Email Notifications
    subscribeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('subscribeEmail').value;
        
        try {
            const response = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await response.json();
            
            subscriptionMessage.style.color = response.ok ? 'green' : 'red';
            subscriptionMessage.textContent = data.message;
            
            if (response.ok) {
                subscribeForm.reset();
            }

        } catch (error) {
            subscriptionMessage.style.color = 'red';
            subscriptionMessage.textContent = 'An unexpected error occurred.';
            console.error('Subscription error:', error);
        }
    });

    // --- ADMINISTRATIVE ACTIONS (Functions) ---

    // Remove Player
    const removePlayer = async (eventId, teeTimeId, playerId) => {
        const deleteCode = prompt('Enter the Admin Code to remove the player:');
        if (!deleteCode) return;

        try {
            const response = await fetch(`/api/events/${eventId}/teetimes/${teeTimeId}/players/${playerId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleteCode }) 
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

    // Remove Tee Time
    const removeTeeTime = async (eventId, teeTimeId, deleteCode) => {
        if (!deleteCode) return;
        try {
            const response = await fetch(`/api/events/${eventId}/teetimes/${teeTimeId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleteCode }) 
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to remove tee time.');
            }
            
            loadEvents(); 
        } catch (error) {
            console.error('Error removing tee time:', error);
            alert(`Error: ${error.message}`);
        }
    };

    // Add Tee Time
    const addTeeTime = async (eventId, time) => {
        try {
            const response = await fetch(`/api/events/${eventId}/teetimes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ time })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to add new tee time.');
            }
            
            loadEvents(); 
        } catch (error) {
            console.error('Error adding tee time:', error);
            alert(`Error: ${error.message}`);
        }
    };

    // Delete Event
    const deleteEvent = async (eventId, deleteCode) => {
        if (!deleteCode) return;
        if (!confirm('Are you sure you want to delete this entire event?')) return;
        
        try {
            const response = await fetch(`/api/events/${eventId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleteCode }) 
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to delete event.');
            }
            
            loadEvents(); 
            alert('Event deleted successfully.');
        } catch (error) {
            console.error('Error deleting event:', error);
            alert(`Error: ${error.message}`);
        }
    };


    // Initial load of events
    loadEvents();
});