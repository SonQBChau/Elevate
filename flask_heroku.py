from keras.models import load_model
import joblib
from helpers import *
import numpy as np
import pandas as pd
from flask import Flask , render_template
from flask import request

def base_model():
    #Create the model
    model = Sequential()
    #Add 1 layer with 8 nodes,input of 4 dim with relu function
    model.add(Dense(8,input_dim=10,activation='relu'))
    #Add 1 layer with output 3 and softmax function
    model.add(Dense(4,activation='softmax'))
    #Compile the model using sigmoid loss function and adam optim
    model.compile(loss='categorical_crossentropy',optimizer='adam',
                 metrics=['accuracy'])
    return model

model = joblib.load('sklearn_pipeline.pkl')
model.named_steps['keras'].model = load_model('model.h5')

target = pd.read_csv('target.csv')

def predict_mood(id_song, c=0):

    preds = get_songs_features(id_song)
    #Pre-process the features to input the Model
    preds_features = np.array(preds[0][6:-2]).reshape(-1,1).T

    #Predict the features of the song
    results = model.predict(preds_features)
    print(results)
    mood = np.array(target['mood'][target['encode']==int(results)])
    name_song = preds[0][0]
    artist = preds[0][2]
    print("{0} by {1} is a {2} song".format(name_song,artist,mood[0].upper()))
    final_data = preds[0] + list(mood)
    print(final_data)
    columns = ['name', 'album', 'artist', 'id', 'release_date', 'popularity', 'length', 'danceability', 'acousticness',
               'energy', 'instrumentalness',
               'liveness', 'valence', 'loudness', 'speechiness', 'tempo', 'key', 'time_signature','mood']
    if c==0:
        return zip(columns,final_data)
    elif c==1:
        return mood

def predict_mood_pl(id_playlist):
    song_list = get_songs_artist_ids_playlist(id_playlist)
    print(song_list)
    mood_list = []
    for song_id in song_list[0]:
        mood_list.append(predict_mood(song_id,c=1))
    print(mood_list)
    return zip(song_list[0],mood_list)

def input_id():
    data_dict = request.form
    song_id = data_dict['Song_ID']
#     artist_id = data_dict['Artist_ID']
    playlist_id = data_dict['Playlist_ID']
    # print(playlist_id)
    # print(len(song_id))
    if len(song_id) != 0:
        return predict_mood(song_id)
    if len(playlist_id) != 0:
        return predict_mood_pl(playlist_id)

app =Flask(__name__)

@app.route("/")
def info():
    return render_template('info.html')

@app.route("/predict", methods=['POST'])
def predict():
    final_data = input_id()
    return render_template("index.html", data = final_data)

if __name__ == '__main__':
#     load_model()
    app.run(host='0.0.0.0', port=8000)
    # app.run()
