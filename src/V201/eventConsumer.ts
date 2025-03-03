import { eventBus } from "./eventBus";

eventBus.on("user.created", (data) => {
  console.log("User Created Event Received:", data);
});
