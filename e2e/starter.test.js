const { device, element, by, expect, waitFor } = require('detox');

describe('Parachute Activity Full App Flow - Production Auth & Activity Bypass', () => {
  beforeAll(async () => {
    // Launching a fresh instance without bypassing authentication
    // Added a launch argument flag to signal the app to deep-route/bypass the live simulation workspace if needed
    await device.launchApp({ 
      newInstance: true,
      launchArgs: { detoxSkipToFinish: true } 
    });
  });

  it('should complete onboarding, log in with test credentials, clear checklist, and complete finish actions', async () => {
    
    // ==========================================
    // STEP 1: ONBOARDING CAROUSEL
    // ==========================================
    // Wait for the first intro screen to appear
    await waitFor(element(by.text('Guide your study'))).toBeVisible().withTimeout(5000);

    // Tap dot index 1 to navigate to intro screen 2
    await element(by.id('intro-dot-1')).tap();
    await new Promise(resolve => setTimeout(resolve, 600)); // let expo-router settle
    await waitFor(element(by.text('Fun Experiments'))).toBeVisible().withTimeout(6000);

    // Tap dot index 2 to navigate to intro screen 3
    await element(by.id('intro-dot-2')).tap();
    await new Promise(resolve => setTimeout(resolve, 600));
    await waitFor(element(by.text('Be your path'))).toBeVisible().withTimeout(6000);
    await new Promise(resolve => setTimeout(resolve, 800));

    // Canonical Detox Way: Scroll down inside the ScrollView ONLY if the button isn't visible yet
    await waitFor(element(by.id('continueButton')))
    .toBeVisible()
    .whileElement(by.id('bottomScrollView'))
    .scroll(100, 'down');

    // Now safely tap it
    await element(by.id('continueButton')).tap();

    // ==========================================
    // STEP 2: ACTUAL USER AUTHENTICATION
    // ==========================================
    // Target your standard STEMM Lab login inputs
    const emailInput = element(by.id('emailInput'));
    const passwordInput = element(by.id('passwordInput'));
    const loginSubmitButton = element(by.id('loginSubmitButton'));

    await waitFor(emailInput).toBeVisible().withTimeout(5000);
    
    // Enter credentials
    await emailInput.typeText('megan.gale@gmail.com');
    await passwordInput.typeText('megan.gale1');
    
    // Dismiss keyboard if necessary or tap submit directly
    await loginSubmitButton.tap();

    // ==========================================
    // STEP 3: DASHBOARD & ACTIVITY ACCESS
    // ==========================================
    const parachuteCard = element(by.text('Parachute'));
    await waitFor(parachuteCard).toBeVisible().withTimeout(7000);
    await parachuteCard.tap();

    const getReadyButton = element(by.text('Get Ready'));
    await waitFor(getReadyButton).toBeVisible().withTimeout(3000);
    await getReadyButton.tap();

    // ==========================================
    // STEP 4: PRE-FLIGHT CHECKLIST CONFIGURATION
    // ==========================================
    await waitFor(element(by.id('checklist-box-0'))).toBeVisible().withTimeout(3000);
    await element(by.id('checklist-box-0')).tap();
    await element(by.id('checklist-box-1')).tap();
    await element(by.id('checklist-box-2')).tap();
    await element(by.id('checklist-box-3')).tap();

    // Scroll to uncover the action button
    await element(by.id('checklistScrollView')).scroll(300, 'down');
    await element(by.text('Start')).tap();

    // ==========================================
    // STEP 5: ACTIVITY FINISH & UPLOAD (BYPASSING LIVE SIMULATION)
    // ==========================================
    // Assuming the launchArgs or custom routing pushes the view directly to the summary view
    const uploadPhotoButton = element(by.id('uploadPhotoButton'));
    const commentTextInput = element(by.id('commentTextInput'));
    const finishSubmitButton = element(by.id('finishSubmitButton'));

    // Validate the screen mounted successfully
    await waitFor(uploadPhotoButton).toBeVisible().withTimeout(5000);

    // Trigger photo upload picker action 
    await uploadPhotoButton.tap();

    // Type performance evaluation / comments
    await commentTextInput.typeText('Simulation completed successfully. Parachute structural stability verified.');

    // Submit the final payload report
    await finishSubmitButton.tap();

    // Confirm navigation or success state returns to dashboard or completion view
    await expect(element(by.text('Activity Completed!'))).toBeVisible();
  });
});