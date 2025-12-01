import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout, Flatten
from tensorflow.keras.applications import ResNet50
from tensorflow.keras.optimizers import Adam
import numpy as np
import math 
import os
from tensorflow.keras.utils import get_file # Import get_file to check for local file

# --- Configuration ---
IMAGE_SIZE = (224, 224) 
BATCH_SIZE = 32
EPOCHS = 5 
DATA_DIR = './PlantVillage' 
MODEL_SAVE_PATH = 'plant_disease_resnet50_model.h5'

# 💡 FIX 4: Define the local path for the weights file
LOCAL_WEIGHTS_FILE = 'resnet50_weights_tf_dim_ordering_tf_kernels_notop.h5'


# 1. Prepare Data Generators
# ResNet50 requires specific preprocessing handled by its function, NOT 1./255
train_datagen = ImageDataGenerator(
    preprocessing_function=tf.keras.applications.resnet50.preprocess_input,
    rotation_range=20,
    width_shift_range=0.2,
    height_shift_range=0.2,
    horizontal_flip=True,
    validation_split=0.2 
)

train_generator = train_datagen.flow_from_directory(
    DATA_DIR,
    target_size=IMAGE_SIZE,
    batch_size=BATCH_SIZE,
    class_mode='categorical',
    subset='training'
)

validation_generator = train_datagen.flow_from_directory(
    DATA_DIR,
    target_size=IMAGE_SIZE,
    batch_size=BATCH_SIZE,
    class_mode='categorical',
    subset='validation'
)

NUM_CLASSES = train_generator.num_classes
CLASS_NAMES = np.array(list(train_generator.class_indices.keys()))
np.save('class_names.npy', CLASS_NAMES) 
print(f"\nSaved class names to class_names.npy. Total classes: {NUM_CLASSES}")


# 2. Define and Compile the Transfer Learning Model
def build_resnet_model(input_shape, num_classes):
    
    # Check if the local file exists, otherwise fall back to 'imagenet' (which triggers download)
    if os.path.exists(LOCAL_WEIGHTS_FILE):
        print(f"✅ Loading weights from local file: {LOCAL_WEIGHTS_FILE}")
        weights_source = LOCAL_WEIGHTS_FILE
    else:
        # If the file is not found locally, it will attempt to download (and fail again with your error)
        print("⚠️ Local weights file not found. Attempting to download from ImageNet...")
        weights_source = 'imagenet'

    # Load ResNet50 with weights from the local file or 'imagenet'
    base_model = ResNet50(
        weights=weights_source, # 💡 FIX 5: Use the determined weights source
        include_top=False, 
        input_shape=input_shape
    )
    
    # Freeze the layers of the base model
    for layer in base_model.layers:
        layer.trainable = False
        
    # Build a new classification head on top
    model = Sequential([
        base_model,
        Flatten(),
        Dense(512, activation='relu'),
        Dropout(0.5),
        Dense(num_classes, activation='softmax')
    ])
    return model

# Initialize and compile the model
model = build_resnet_model(IMAGE_SIZE + (3,), NUM_CLASSES)

model.compile(
    optimizer=Adam(learning_rate=0.0001),
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

model.summary()


# 3. Train the model
print("\nStarting Transfer Learning model training...")
history = model.fit(
    train_generator,
    
    # 💡 FIX 2: Use math.ceil for steps_per_epoch
    steps_per_epoch=math.ceil(train_generator.samples / BATCH_SIZE), 
    
    epochs=EPOCHS,
    validation_data=validation_generator,
    
    # 💡 FIX 3: Use math.ceil for validation_steps
    validation_steps=math.ceil(validation_generator.samples / BATCH_SIZE) 
)

# 4. Save the Model
model.save(MODEL_SAVE_PATH)
print(f"\n✅ Training complete. Model saved to: {MODEL_SAVE_PATH}")